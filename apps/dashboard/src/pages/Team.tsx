import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Check, RotateCcw, X } from 'lucide-react'
import { useAccount, useCurrentStore, useStorePath } from '../account-context'
import { api, errorCode } from '../api'
import { Badge, Button, Field, Notice, PageHeader, Skeleton } from '../components/ui'
import { errorLabel, useLang } from '../i18n'

type Board = { open: { userId: string; name: string; startedAt: string }[]; days: { userId: string; name: string; day: string; minutes: number }[] }
type Task = { id: string; title: string; dueOn: string | null; assigneeId: string | null; assignee: string | null; doneAt: string | null }
type Member = { id: string; name: string }

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })

function useBoard(base: string) {
  const [board, setBoard] = useState<Board | null>(null)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    setFailed(false)
    try {
      setBoard(await api<Board>(`${base}/shifts`))
    } catch {
      setFailed(true)
    }
  }, [base])
  useEffect(() => {
    void load()
  }, [load])
  return { board, failed, load }
}

// Clock in and out, and who else is on shift. The board is read when the page opens; reopen it to refresh.
export function TeamToday() {
  const { t, num, time } = useLang()
  const { me } = useAccount()
  const path = useStorePath()
  const base = `/stores/${useCurrentStore()!.store.handle}`
  const { board, failed, load } = useBoard(base)
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    api<Task[]>(`${base}/tasks`).then(setTasks).catch(() => {})
  }, [base])

  const mine = board?.open.find((s) => s.userId === me.id)
  const clock = async (action: 'start' | 'end') => {
    await api(`${base}/shifts/${action}`, { method: 'POST' })
    await load()
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={t('team')} description={t('team.d')} />
      {failed && <section className="card card--flush"><Notice role="alert" title={t('teamLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && !board && <section className="card"><Skeleton /></section>}
      {board && (
        <>
          <section className="card">
            <div className="card__head">
              <div>
                <h2>{mine ? t('shiftYouAreIn') : t('shiftYouAreOut')}</h2>
                {mine && <p className="muted">{t('shiftSince', { time: time(mine.startedAt) })}</p>}
              </div>
              {mine ? <Button onClick={() => void clock('end')}>{t('shiftEnd')}</Button> : <Button variant="primary" onClick={() => void clock('start')}>{t('shiftStart')}</Button>}
            </div>
          </section>
          <section className="card">
            <h2>{t('shiftOnNow')}</h2>
            {board.open.length === 0
              ? <p className="muted">{t('shiftNobody')}</p>
              : <ul className="blocked-list">{board.open.map((s) => <li key={s.userId}><span className="blocked-list__text"><strong>{s.name}</strong><span className="muted">{t('shiftSince', { time: time(s.startedAt) })}</span></span></li>)}</ul>}
          </section>
          <section className="card">
            <div className="card__head">
              <h2>{t('teamOpenTasks')} <span className="tab__count">{num(tasks.length)}</span></h2>
              <Link to={path('/team/tasks')}>{t('teamSeeTasks')}</Link>
            </div>
            {tasks.length === 0 ? <p className="muted">{t('taskEmpty')}</p> : <ul className="stack">{tasks.slice(0, 5).map((task) => <li key={task.id}>{task.title}{task.assignee && <span className="muted"> · {task.assignee}</span>}</li>)}</ul>}
          </section>
        </>
      )}
    </div>
  )
}

export function Attendance() {
  const { t, num, date } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}`
  const { board, failed, load } = useBoard(base)
  const duration = (minutes: number) => t('shiftDuration', { h: num(Math.floor(minutes / 60)), m: num(minutes % 60) })
  return (
    <div className="page page--narrow">
      <PageHeader title={t('attendance')} description={t('attendance.d')} />
      {failed && <section className="card card--flush"><Notice role="alert" title={t('teamLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} /></section>}
      {!failed && !board && <section className="card"><Skeleton /></section>}
      {board && (
        <section className="card">
          <h2>{t('shiftHours')}</h2>
          {board.days.length === 0
            ? <p className="muted">{t('shiftHoursEmpty')}</p>
            : (
              <table className="table">
                <thead><tr><th scope="col">{t('colDay')}</th><th scope="col">{t('colMember')}</th><th scope="col" className="num">{t('colHours')}</th></tr></thead>
                <tbody>
                  {board.days.map((d) => (
                    <tr key={`${d.userId}-${d.day}`}>
                      <td data-label={t('colDay')}>{date(new Date(`${d.day}T00:00:00Z`))}</td>
                      <td data-label={t('colMember')}>{d.name}{board.open.some((s) => s.userId === d.userId) && d.day === today() && <> <Badge tone="success">{t('shiftOnNow')}</Badge></>}</td>
                      <td className="num" data-label={t('colHours')}>{duration(d.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      )}
    </div>
  )
}

export function Tasks() {
  const { t, date } = useLang()
  const base = `/stores/${useCurrentStore()!.store.handle}`
  const [done, setDone] = useState(false)
  const [rows, setRows] = useState<Task[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState({ title: '', dueOn: '', assigneeId: '' })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRows(await api<Task[]>(`${base}/tasks${done ? '?done=1' : ''}`))
    } catch {
      setFailed(true)
    }
  }, [base, done])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    api<{ members: Member[] }>(`${base}/members`).then((r) => setMembers(r.members)).catch(() => {})
  }, [base])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.title.trim()) return
    try {
      await api(`${base}/tasks`, { method: 'POST', body: { title: form.title, dueOn: form.dueOn || null, assigneeId: form.assigneeId || null } })
      setForm({ title: '', dueOn: '', assigneeId: form.assigneeId })
      if (done) setDone(false)
      else await load()
    } catch (err) {
      setError(errorCode(err))
    }
  }
  const tick = async (task: Task) => {
    await api(`${base}/tasks/${task.id}`, { method: 'PATCH', body: { done: !task.doneAt } })
    setRows((all) => all && all.filter((x) => x.id !== task.id))
  }
  const remove = async (task: Task) => {
    await api(`${base}/tasks/${task.id}`, { method: 'DELETE' })
    setRows((all) => all && all.filter((x) => x.id !== task.id))
  }

  return (
    <div className="page page--narrow">
      <PageHeader title={t('tasks')} description={t('tasks.d')} />
      <form className="card card--form" onSubmit={(e) => void add(e)} noValidate>
        <Field id="task-title" label={t('taskTitle')} placeholder={t('taskTitleHint')} maxLength={300} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <div className="price-grid price-grid--two">
          <Field id="task-due" type="date" label={t('taskDue')} value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} />
          <div className="field">
            <label htmlFor="task-assignee">{t('taskAssignee')}</label>
            <select id="task-assignee" className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">{t('taskAnyone')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{t(errorLabel(error))}</p>}
        <div className="row"><Button type="submit" variant="primary" disabled={!form.title.trim()}>{t('taskAdd')}</Button></div>
      </form>
      <section className="card">
        <nav className="tabs" aria-label={t('tasks')}>
          <button type="button" className="tab" aria-current={!done ? 'page' : undefined} onClick={() => setDone(false)}>{t('taskOpen')}</button>
          <button type="button" className="tab" aria-current={done ? 'page' : undefined} onClick={() => setDone(true)}>{t('taskDone')}</button>
        </nav>
        {failed && <Notice role="alert" title={t('teamLoadFailed')} action={<Button onClick={() => void load()}>{t('retry')}</Button>} />}
        {!failed && !rows && <Skeleton />}
        {rows && rows.length === 0 && <p className="muted">{done ? t('taskEmptyDone') : t('taskEmpty')}</p>}
        {rows && rows.length > 0 && (
          <ul className="blocked-list">
            {rows.map((task) => (
              <li key={task.id}>
                <button type="button" className="media__dismiss" aria-label={t(task.doneAt ? 'taskReopen' : 'taskMarkDone', { value: task.title })} title={t(task.doneAt ? 'taskReopen' : 'taskMarkDone', { value: task.title })} onClick={() => void tick(task)}>
                  {task.doneAt ? <RotateCcw size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                </button>
                <span className="blocked-list__text">
                  <strong>{task.title}</strong>
                  <span className="muted">{[task.assignee, task.dueOn && date(new Date(`${task.dueOn}T00:00:00Z`))].filter(Boolean).join(' · ')}</span>
                </span>
                {!task.doneAt && task.dueOn && task.dueOn < today() && <Badge tone="warning">{t('taskOverdue')}</Badge>}
                <button type="button" className="media__dismiss" aria-label={t('taskDelete', { value: task.title })} title={t('taskDelete', { value: task.title })} onClick={() => void remove(task)}><X size={16} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
