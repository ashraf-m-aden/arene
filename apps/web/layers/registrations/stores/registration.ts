import { defineStore } from 'pinia'

type Step = 1 | 2 | 3 | 4

interface DraftState {
  registrationId: string | null
  editionId: string | null
  step: Step
  player: {
    firstName: string
    lastName: string
    birthDate: string
    gender: 'm' | 'f' | ''
    photoFileId: string | null
  }
  schoolId: string | null
  schoolLabel: string
  newSchool: { name: { fr: string; ar: string }; type: 'lycee' | 'universite'; city: string } | null
  role: 'striker' | 'defender' | ''
  ageCategory: 'lycee' | 'universite' | ''
  grades: { average: number | null; term: string; bulletinFileId: string | null; bulletinName: string }
  consents: {
    participation: boolean
    imageRights: boolean
    monetizedVideos: boolean
    bulletinAuthenticity: boolean
    signerName: string
  }
}

const emptyDraft = (): DraftState => ({
  registrationId: null,
  editionId: null,
  step: 1,
  player: { firstName: '', lastName: '', birthDate: '', gender: '', photoFileId: null },
  schoolId: null,
  schoolLabel: '',
  newSchool: null,
  role: '',
  ageCategory: '',
  grades: { average: null, term: '', bulletinFileId: null, bulletinName: '' },
  consents: {
    participation: false,
    imageRights: false,
    monetizedVideos: false,
    bulletinAuthenticity: false,
    signerName: ''
  }
})

/**
 * Brouillon d'inscription. Il est persisté localement pour survivre à une
 * coupure de connexion, et synchronisé avec l'API à chaque étape validée.
 */
export const useRegistrationStore = defineStore('registration', {
  state: () => ({
    draft: emptyDraft(),
    mine: [] as any[],
    pending: false,
    error: '',
    submitted: false
  }),

  getters: {
    hasDraft: (state) => Boolean(state.draft.registrationId),
    stepsDone: (state) => ({
      1: Boolean(state.draft.player.firstName && state.draft.player.birthDate && state.draft.role),
      2: Boolean(state.draft.grades.average !== null && state.draft.grades.bulletinFileId),
      3: Boolean(
        state.draft.consents.participation &&
          state.draft.consents.bulletinAuthenticity &&
          state.draft.consents.signerName
      ),
      4: false
    }),
    missingFields(): string[] {
      const missing: string[] = []
      const draft = this.draft
      if (!draft.player.firstName || !draft.player.lastName) missing.push('player.name')
      if (!draft.player.birthDate) missing.push('player.birthDate')
      if (!draft.schoolId && !draft.newSchool) missing.push('school')
      if (!draft.role) missing.push('role')
      if (draft.grades.average === null) missing.push('grades.average')
      if (!draft.grades.bulletinFileId) missing.push('grades.bulletin')
      if (!draft.consents.participation) missing.push('consents.participation')
      if (!draft.consents.bulletinAuthenticity) missing.push('consents.authenticity')
      if (!draft.consents.signerName) missing.push('consents.signerName')
      return missing
    }
  },

  actions: {
    reset() {
      this.draft = emptyDraft()
      this.submitted = false
      this.error = ''
    },

    /** Crée le brouillon côté API, ou retrouve celui déjà ouvert. */
    async start(editionId: string, locale: 'fr' | 'ar') {
      const { $api } = useNuxtApp()
      if (this.draft.registrationId && this.draft.editionId === editionId) {
        return this.draft.registrationId
      }
      const { data } = await $api.post<{ data: any }>('/registrations', { editionId, locale })
      this.draft = { ...emptyDraft(), registrationId: data._id, editionId }
      return data._id
    },

    /** Envoie une étape : l'API renvoie la catégorie déduite de l'établissement. */
    async saveStep(step: Step) {
      const { $api } = useNuxtApp()
      if (!this.draft.registrationId) throw new Error('Brouillon absent')
      this.pending = true
      this.error = ''

      try {
        const payload: Record<string, unknown> = {}

        if (step === 1) {
          payload.player = {
            firstName: this.draft.player.firstName,
            lastName: this.draft.player.lastName,
            birthDate: this.draft.player.birthDate,
            gender: this.draft.player.gender,
            ...(this.draft.player.photoFileId ? { photoFileId: this.draft.player.photoFileId } : {})
          }
          payload.role = this.draft.role
          if (this.draft.newSchool) payload.newSchool = this.draft.newSchool
          else if (this.draft.schoolId) payload.schoolId = this.draft.schoolId
        }

        if (step === 2) {
          payload.grades = {
            average: this.draft.grades.average,
            term: this.draft.grades.term,
            bulletinFileId: this.draft.grades.bulletinFileId
          }
        }

        if (step === 3) {
          payload.consents = { ...this.draft.consents }
        }

        const { data } = await $api.patch<{ data: any }>(
          `/registrations/${this.draft.registrationId}`,
          payload
        )
        if (data.ageCategory) this.draft.ageCategory = data.ageCategory
        this.draft.step = Math.min(4, Math.max(this.draft.step, step + 1)) as Step
        return data
      } catch (error: any) {
        this.error = error.message
        throw error
      } finally {
        this.pending = false
      }
    },

    /** Envoi d'un fichier (bulletin ou photo) : l'API renvoie son identifiant. */
    async uploadFile(file: File, kind: 'bulletin' | 'photo') {
      const { $api } = useNuxtApp()
      const body = new FormData()
      body.append('file', file)
      const { data } = await $api.post<{ data: any }>(
        `/files?kind=${kind}${this.draft.editionId ? `&editionId=${this.draft.editionId}` : ''}`,
        body
      )
      if (kind === 'bulletin') {
        this.draft.grades.bulletinFileId = data._id
        this.draft.grades.bulletinName = file.name
      } else {
        this.draft.player.photoFileId = data._id
      }
      return data
    },

    async submit() {
      const { $api } = useNuxtApp()
      if (!this.draft.registrationId) throw new Error('Brouillon absent')
      this.pending = true
      this.error = ''
      try {
        const { data } = await $api.post<{ data: any }>(
          `/registrations/${this.draft.registrationId}/submit`,
          { confirm: true }
        )
        this.submitted = true
        await this.fetchMine()
        this.reset()
        return data
      } catch (error: any) {
        this.error = error.message
        throw error
      } finally {
        this.pending = false
      }
    },

    async fetchMine() {
      const { $api } = useNuxtApp()
      const { data } = await $api.get<{ data: any[] }>('/registrations/mine')
      this.mine = data
      return data
    },

    async remove(id: string) {
      const { $api } = useNuxtApp()
      await $api.delete(`/registrations/${id}`)
      this.mine = this.mine.filter((item) => item._id !== id)
    }
  },

  persist: {
    // Le brouillon survit à une coupure ; la liste des dossiers est rechargée.
    pick: ['draft']
  }
})
