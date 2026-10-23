import { defineStore } from 'pinia'

type Step = 1 | 2 | 3 | 4

/**
 * Miroir de `CANDIDATE_EDITABLE_STATUSES` dans `registrations.service` : au-dela,
 * l'API refuse toute modification et le formulaire n'a plus lieu d'etre affiche.
 */
export const CANDIDATE_EDITABLE_STATUSES = ['draft', 'changes_requested']

interface DraftState {
  registrationId: string | null
  editionId: string | null
  /** Statut du dossier cote API : il decide si le formulaire est encore ouvert. */
  status: string
  step: Step
  player: {
    /** Copie du nom du compte, posée par l'API. Jamais saisie ici. */
    name: string
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
  }
}

const emptyDraft = (): DraftState => ({
  registrationId: null,
  editionId: null,
  status: 'draft',
  step: 1,
  player: { name: '', birthDate: '', gender: '', photoFileId: null },
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
    bulletinAuthenticity: false
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
    /** Un dossier envoye n'est plus modifiable : le formulaire doit le dire. */
    canEdit: (state) => CANDIDATE_EDITABLE_STATUSES.includes(state.draft.status),
    /**
     * Meme question pour un dossier qui n'est pas le brouillon courant. Expose
     * en getter plutot qu'en export : les pages n'importent rien, tout passe
     * par l'auto-import du store.
     */
    isEditableStatus: () => (status?: string) =>
      CANDIDATE_EDITABLE_STATUSES.includes(String(status)),
    stepsDone: (state) => ({
      1: Boolean(state.draft.player.birthDate && state.draft.role),
      2: Boolean(state.draft.grades.average !== null && state.draft.grades.bulletinFileId),
      3: Boolean(
        state.draft.consents.participation &&
          state.draft.consents.imageRights &&
          state.draft.consents.bulletinAuthenticity
      ),
      4: false
    }),
    missingFields(): string[] {
      const missing: string[] = []
      const draft = this.draft
      if (!draft.player.birthDate) missing.push('player.birthDate')
      if (!draft.schoolId && !draft.newSchool) missing.push('school')
      if (!draft.role) missing.push('role')
      if (draft.grades.average === null) missing.push('grades.average')
      if (!draft.grades.bulletinFileId) missing.push('grades.bulletin')
      if (!draft.consents.participation) missing.push('consents.participation')
      if (!draft.consents.imageRights) missing.push('consents.imageRights')
      if (!draft.consents.bulletinAuthenticity) missing.push('consents.authenticity')
      return missing
    }
  },

  actions: {
    reset() {
      this.draft = emptyDraft()
      this.submitted = false
      this.error = ''
    },

    /**
     * Charge le dossier de l'édition dans le brouillon local.
     *
     * L'API ne crée jamais un second dossier : `createDraft` rend celui qui
     * existe déjà, quel que soit son statut. Encore faut-il l'afficher — en
     * ne gardant que l'identifiant de la réponse, on présentait un formulaire
     * vide par-dessus un dossier rempli, et le candidat croyait repartir de
     * zéro. Tout ce que la réponse porte est donc repris ici.
     */
    async start(editionId: string, locale: 'fr' | 'ar') {
      const { $api } = useNuxtApp()
      if (this.draft.registrationId && this.draft.editionId === editionId) {
        return this.draft.registrationId
      }
      const { data } = await $api.post<{ data: any }>('/registrations', { editionId, locale })
      this.hydrate(data, editionId)
      return data._id
    },

    /** Recopie un dossier de l'API dans le brouillon, sans perdre ce qu'il porte. */
    hydrate(data: any, editionId: string) {
      const draft = emptyDraft()
      draft.registrationId = data._id
      draft.editionId = editionId
      draft.status = data.status || 'draft'
      // L'API avance `step` au fil des étapes validées : on reprend où le
      // candidat s'était arrêté plutôt que de le renvoyer à l'étape 1.
      draft.step = (Math.min(4, Math.max(1, Number(data.step) || 1)) as Step)

      draft.player.name = data.player?.name || ''
      // L'API renvoie une date ISO complète ; l'input date attend AAAA-MM-JJ.
      draft.player.birthDate = data.player?.birthDate
        ? String(data.player.birthDate).slice(0, 10)
        : ''
      draft.player.gender = data.player?.gender || ''
      draft.player.photoFileId = data.player?.photoFileId || null

      draft.schoolId = data.schoolId || null
      draft.role = data.role || ''
      draft.ageCategory = data.ageCategory || ''

      draft.grades.average = data.grades?.average ?? null
      draft.grades.term = data.grades?.term || ''
      draft.grades.bulletinFileId = data.grades?.bulletinFileId || null
      // Le nom du fichier n'est pas stocké : on signale qu'un bulletin est là.
      draft.grades.bulletinName = data.grades?.bulletinFileId ? '—' : ''

      draft.consents.participation = Boolean(data.consents?.participation)
      draft.consents.imageRights = Boolean(data.consents?.imageRights)
      draft.consents.monetizedVideos = Boolean(data.consents?.monetizedVideos)
      draft.consents.bulletinAuthenticity = Boolean(data.consents?.bulletinAuthenticity)

      this.draft = draft
      this.submitted = false
      this.error = ''
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

    /**
     * Le dossier de cette edition tel que l'API le connait.
     *
     * `hasDraft` ne lit que le brouillon persiste localement : sur un autre
     * appareil ou apres un vidage du navigateur, il repond faux alors que le
     * dossier existe. Pour choisir ce qu'on propose au candidat, il faut la
     * reponse de l'API, pas celle du stockage local.
     */
    async findForEdition(editionId: string) {
      const items = this.mine.length ? this.mine : await this.fetchMine()
      return (
        items.find((row: any) => String(row.editionId?._id ?? row.editionId) === String(editionId)) ??
        null
      )
    },

    async fetchMine() {
      const { $api } = useNuxtApp()
      const { data } = await $api.get<{ data: any[] }>('/registrations/mine')
      this.mine = data
      return data
    }
  },

  persist: {
    // Le brouillon survit à une coupure ; la liste des dossiers est rechargée.
    pick: ['draft']
  }
})
