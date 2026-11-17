// Grants or removes platform-administrator access (the console). Run on the server only, never from the web:
//   npm run admin -w console -- add someone@example.com
//   npm run admin -w console -- remove someone@example.com
//   npm run admin -w console -- list
import { pool } from '../../api/src/db.ts'

const [action, email] = process.argv.slice(2)
try {
  if (action === 'list') {
    const { rows } = await pool.query('select u.email, a.created_at from platform_admins a join users u on u.id = a.user_id order by a.created_at')
    console.log(rows.length ? rows.map((r) => `${r.email}  (since ${r.created_at.toISOString().slice(0, 10)})`).join('\n') : 'No platform administrators.')
  } else if ((action === 'add' || action === 'remove') && email) {
    const { rows } = await pool.query('select id from users where email = lower($1)', [email.trim()])
    if (!rows.length) throw new Error(`No account with the email ${email}. Sign up first, then run this again.`)
    if (action === 'add') await pool.query('insert into platform_admins (user_id) values ($1) on conflict do nothing', [rows[0].id])
    else await pool.query('delete from platform_admins where user_id = $1', [rows[0].id])
    console.log(action === 'add' ? `${email} can now use the console.` : `${email} can no longer use the console.`)
  } else {
    console.log('Usage: admin add|remove <email>, or admin list')
    process.exitCode = 1
  }
} catch (err) {
  console.error((err as Error).message)
  process.exitCode = 1
} finally {
  await pool.end()
}
