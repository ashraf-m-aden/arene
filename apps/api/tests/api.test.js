import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { connectDb, disconnectDb, mongoose } from '../src/core/db.js'

/**
 * Tests d'intégration : ils tournent dès qu'une base de test est disponible
 * (MONGO_TEST_URI), et sont ignorés sinon pour ne pas bloquer l'intégration continue.
 */
const uri = process.env.MONGO_TEST_URI
const maybe = uri ? describe : describe.skip

maybe('API', () => {
  let app

  beforeAll(async () => {
    await connectDb(uri)
    await mongoose.connection.dropDatabase()
    app = createApp()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  it('répond sur /health', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('refuse une route inconnue', async () => {
    const res = await request(app).get('/api/v1/inconnu')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('not_found')
  })

  it('protège la liste des inscriptions', async () => {
    const res = await request(app).get('/api/v1/registrations')
    expect(res.status).toBe(401)
  })

  it('valide le corps d’une inscription de compte', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ phone: '123' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('unprocessable')
  })

  it('crée un compte candidat puis renvoie son profil', async () => {
    const register = await request(app).post('/api/v1/auth/register').send({
      name: 'Fatouma Test Ahmed',
      email: 'candidate.test@example.dj',
      phone: '+25377123456',
      password: 'MotDePasse1',
      locale: 'fr'
    })
    expect(register.status).toBe(201)
    const token = register.body.data.accessToken
    expect(token).toBeTruthy()

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(200)
    expect(me.body.data.role).toBe('candidate')
    // Le nom est saisi une seule fois, en un seul champ : il doit revenir tel quel.
    expect(me.body.data.name).toBe('Fatouma Test Ahmed')
  })

  it('sert les octets d’une pièce par identifiant valide seulement', async () => {
    // Les portraits préchargés par le check-in passent par cette route.
    const badId = await request(app).get('/api/v1/files/pas-un-identifiant/content')
    expect(badId.status).toBe(422)

    const unknown = await request(app).get('/api/v1/files/507f1f77bcf86cd799439011/content')
    expect(unknown.status).toBe(404)
    expect(unknown.body.error.key).toBe('fileMissing')
  })

  it('n’expose pas les éditions en brouillon', async () => {
    const res = await request(app).get('/api/v1/editions')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  /**
   * Suppressions définitives. On vérifie ici ce qui doit rester vrai quoi qu'il
   * arrive : qui a le droit, et ce que le serveur exige avant d'effacer. Les
   * garde-fous de l'écran ne comptent pas — c'est l'API qu'on attaque.
   */
  describe('suppression définitive', () => {
    let candidateToken
    let candidateId
    let adminToken
    let registrationId

    beforeAll(async () => {
      const { User } = await import('../src/modules/auth/auth.model.js')
      const { hashPassword } = await import('../src/modules/auth/auth.service.js')

      const register = await request(app).post('/api/v1/auth/register').send({
        name: 'Ahmed Suppression Test',
        email: 'suppression.test@example.dj',
        phone: '+25377987654',
        password: 'MotDePasse1',
        locale: 'fr'
      })
      candidateToken = register.body.data.accessToken
      candidateId = register.body.data.user._id

      await User.create({
        name: 'Admin Suppression Test',
        email: 'admin.suppression@example.dj',
        role: 'admin',
        passwordHash: await hashPassword('MotDePasse1')
      })
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin.suppression@example.dj', password: 'MotDePasse1' })
      adminToken = login.body.data.accessToken

      // Un dossier a supprimer, cree directement : la fenetre d'inscription
      // d'une edition de demonstration n'a pas a entrer dans ce test.
      const { Registration } = await import('../src/modules/registrations/registrations.model.js')
      const { Edition } = await import('../src/modules/editions/editions.model.js')
      const edition = await Edition.create({
        slug: 'edition-suppression-test',
        title: { fr: 'Édition test' },
        registrationOpensAt: new Date(Date.now() - 86400000),
        registrationClosesAt: new Date(Date.now() + 86400000),
        capacity: { universite: { striker: 10, defender: 10 } }
      })
      const registration = await Registration.create({
        editionId: edition._id,
        candidateId,
        status: 'draft',
        player: { name: 'Ahmed Suppression Test' }
      })
      registrationId = String(registration._id)
    })

    it('refuse la suppression d’un dossier à un candidat', async () => {
      const res = await request(app)
        .delete(`/api/v1/registrations/${registrationId}`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ reason: 'je veux partir maintenant', confirm: 'PEU IMPORTE' })
      expect(res.status).toBe(403)
    })

    it('refuse la suppression d’un dossier à un anonyme', async () => {
      const res = await request(app)
        .delete(`/api/v1/registrations/${registrationId}`)
        .send({ reason: 'tentative anonyme sur le dossier', confirm: 'PEU IMPORTE' })
      expect(res.status).toBe(401)
    })

    it('exige un motif consistant', async () => {
      const res = await request(app)
        .delete(`/api/v1/registrations/${registrationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'test', confirm: 'PEU IMPORTE' })
      expect(res.status).toBe(422)
    })

    it('annonce l’impact et la référence à retaper', async () => {
      const res = await request(app)
        .get(`/api/v1/registrations/${registrationId}/deletion-impact`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.data.confirm).toBe(registrationId.slice(-6).toUpperCase())
      expect(res.body.data.impact).toMatchObject({ matches: 0, playedMatches: 0 })
      expect(res.body.data.blockers).toEqual([])
    })

    it('refuse une confirmation qui ne correspond pas', async () => {
      const res = await request(app)
        .delete(`/api/v1/registrations/${registrationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'doublon créé par erreur au guichet', confirm: 'MAUVAIS' })
      expect(res.status).toBe(400)
      expect(res.body.error.key).toBe('deletionConfirmMismatch')
    })

    it('supprime le dossier avec la bonne confirmation', async () => {
      const reference = registrationId.slice(-6).toUpperCase()
      const res = await request(app)
        .delete(`/api/v1/registrations/${registrationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'doublon créé par erreur au guichet', confirm: reference })
      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)

      const gone = await request(app)
        .get(`/api/v1/registrations/${registrationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(gone.status).toBe(404)
    })

    it('laisse une trace complète dans le journal d’audit', async () => {
      // Le dossier est parti : le journal est tout ce qui reste.
      const { AuditLog } = await import('../src/core/middlewares/audit.js')

      // L'instantane, ecrit avant l'effacement.
      const requested = await AuditLog.findOne({
        action: 'registration.delete_requested',
        'target.id': registrationId
      })
      expect(requested).toBeTruthy()
      expect(requested.meta.reason).toBe('doublon créé par erreur au guichet')
      expect(requested.meta.snapshot.name).toBe('Ahmed Suppression Test')

      // La confirmation, ecrite seulement apres le succes.
      const done = await AuditLog.findOne({
        action: 'registration.delete',
        'target.id': registrationId
      })
      expect(done).toBeTruthy()
      expect(done.actorRole).toBe('admin')
    })

    it('ne confirme pas dans le journal une tentative refusée', async () => {
      /*
       * Un refus laisse la ligne « demandee » mais jamais la ligne « faite » :
       * c'est ce qui permet de distinguer, des mois plus tard, une tentative
       * d'un effacement reel.
       */
      const { AuditLog } = await import('../src/core/middlewares/audit.js')
      const requested = await AuditLog.countDocuments({
        action: 'registration.delete_requested',
        'target.id': registrationId
      })
      const done = await AuditLog.countDocuments({
        action: 'registration.delete',
        'target.id': registrationId
      })
      // Deux demandes (la confirmation ratee, puis la bonne), un seul effacement.
      expect(requested).toBe(2)
      expect(done).toBe(1)
    })

    it('refuse à l’administrateur de supprimer son propre compte', async () => {
      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
      const res = await request(app)
        .delete(`/api/v1/auth/users/${me.body.data._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'je quitte l’organisation', confirm: me.body.data.email })
      expect(res.status).toBe(409)
      expect(res.body.error.key).toBe('cannotDeleteSelf')
    })

    it('supprime un compte candidat et ses dossiers', async () => {
      const res = await request(app)
        .delete(`/api/v1/auth/users/${candidateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'demande d’effacement reçue par courrier',
          confirm: 'suppression.test@example.dj'
        })
      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)

      const { User } = await import('../src/modules/auth/auth.model.js')
      expect(await User.findById(candidateId)).toBeNull()
    })
  })
})
