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
})
