import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

export function CommentThread({ proposalId }) {
  const { t } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [body, setBody]         = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!supabase || !proposalId) { setLoading(false); return }
    supabase
      .from('comments')
      .select('id, body, created_at, profiles(username)')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setComments(data ?? []); setLoading(false) })
  }, [proposalId])

  async function submit(e) {
    e.preventDefault()
    if (!body.trim() || !supabase || !user) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('comments')
      .insert({ proposal_id: proposalId, author_id: user.id, body: body.trim() })
      .select('id, body, created_at, profiles(username)')
      .single()
    if (!error && data) { setComments(prev => [...prev, data]); setBody('') }
    setSubmitting(false)
  }

  return (
    <div className="comment-thread">
      {loading ? (
        <p className="comment-empty">{t('comment.loading')}</p>
      ) : comments.length === 0 ? (
        <p className="comment-empty">{t('comment.empty')}</p>
      ) : (
        <div className="comment-list">
          {comments.map(c => (
            <div key={c.id} className="comment-item">
              <div className="comment-header">
                <span className="comment-author">{c.profiles?.username ?? '?'}</span>
                <span className="comment-date">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="comment-body">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {isAuthenticated && (
        <form className="comment-form" onSubmit={submit}>
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={t('comment.placeholder')}
            maxLength={2000}
          />
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flexShrink: 0 }}
            disabled={submitting || !body.trim()}
          >
            {t('comment.submit')}
          </button>
        </form>
      )}
    </div>
  )
}
