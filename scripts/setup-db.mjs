import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// --- Configuration ---
const DB_PASSWORD = process.argv[2] || process.env.DB_PASSWORD
const DB_HOST = 'db.qgnpuszqwcdvnqerrrsx.supabase.co'
const DB_PORT = 5432
const DB_NAME = 'postgres'
const DB_USER = 'postgres'

const SUPABASE_URL = 'https://qgnpuszqwcdvnqerrrsx.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnbnB1c3pxd2Nkdm5xZXJycnN4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY2MTYxMSwiZXhwIjoyMDg3MjM3NjExfQ.ytYgb9SNVnDxDcMu3gL60AamNXFICDE1n2DzdhDwXjo'

if (!DB_PASSWORD) {
  console.error('Usage: node scripts/setup-db.mjs <DB_PASSWORD>')
  console.error('   or: DB_PASSWORD=xxx node scripts/setup-db.mjs')
  process.exit(1)
}

// --- Step 1: Run migration SQL via pg ---
async function runMigration() {
  console.log('=== Step 1: Running database migration ===')
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '00001_complete_schema.sql')
  const sql = readFileSync(sqlPath, 'utf-8')

  const client = new pg.Client({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    console.log('Connected to database')
    await client.query(sql)
    console.log('Migration completed successfully! (20 tables, indexes, RLS, triggers, seed data)')
  } catch (err) {
    if (err.message?.includes('already exists')) {
      console.log('Tables already exist, skipping migration.')
    } else {
      throw err
    }
  } finally {
    await client.end()
  }
}

// --- Step 2: Create test user ---
async function createTestUser() {
  console.log('')
  console.log('=== Step 2: Creating test user via Supabase Auth Admin API ===')

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  let userId

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: 'admin@panetto.co.jp',
    password: 'panetto2024',
    email_confirm: true,
    user_metadata: { name: '管理者テスト' }
  })

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      console.log('Auth user already exists, fetching...')
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users?.find(u => u.email === 'admin@panetto.co.jp')
      if (existing) {
        userId = existing.id
        console.log('Found existing user:', userId)
      } else {
        console.error('Could not find existing user')
        return
      }
    } else {
      console.error('Auth error:', authError)
      return
    }
  } else {
    userId = authUser.user.id
    console.log('Auth user created:', userId)
  }

  // Create public.users record
  console.log('Creating public.users record...')
  const { error: insertError } = await supabase
    .from('users')
    .upsert({
      id: userId,
      organization_id: '00000000-0000-0000-0000-000000000001',
      department_id: '00000000-0000-0000-0002-000000000008',
      office_id: '00000000-0000-0000-0001-000000000001',
      email: 'admin@panetto.co.jp',
      name: '管理者テスト',
      role: 'admin',
      user_type: 'admin',
      is_active: true,
    }, { onConflict: 'id' })
    .select()

  if (insertError) {
    console.error('Insert error:', insertError)
    return
  }

  console.log('Public user created/updated successfully')
  console.log('')
  console.log('========================================')
  console.log('  Setup Complete!')
  console.log('========================================')
  console.log('  テストアカウント情報:')
  console.log('  Email:    admin@panetto.co.jp')
  console.log('  Password: panetto2024')
  console.log('  Role:     admin (管理者)')
  console.log('  部署:     情報システム部')
  console.log('  拠点:     東京本社')
  console.log('========================================')
}

// --- Main ---
async function main() {
  await runMigration()
  await createTestUser()
}

main().catch(err => {
  console.error('Setup failed:', err.message)
  process.exit(1)
})
