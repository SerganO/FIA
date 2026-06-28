import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

export function VoteButtons({ proposalId, upvotes: initUp = 0, downvotes: initDown = 0 }) {
  const { t } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const [up, setUp]     = useState(initUp)
  const [down, setDown] = useState(initDown)
  const [myVote, setMyVote] = useState(null)   // 1 | -1 | null
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase || !user || !proposalId) return
    supabase
      .from('votes')
      .select('vote_type')
      .eq('proposal_id', proposalId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setMyVote(data?.vote_type ?? null))
  }, [proposalId, user])

  async function vote(type) {
    if (!isAuthenticated || !supabase || busy) return
    setBusy(true)
    try {
      if (myVote === type) {
        await supabase.from('votes').delete()
          .eq('proposal_id', proposalId).eq('user_id', user.id)
        setMyVote(null)
        type === 1 ? setUp(v => v - 1) : setDown(v => v - 1)
      } else if (myVote !== null) {
        await supabase.from('votes').update({ vote_type: type })
          .eq('proposal_id', proposalId).eq('user_id', user.id)
        setMyVote(type)
        if (type === 1) { setUp(v => v + 1); setDown(v => v - 1) }
        else            { setDown(v => v + 1); setUp(v => v - 1) }
      } else {
        await supabase.from('votes')
          .insert({ proposal_id: proposalId, user_id: user.id, vote_type: type })
        setMyVote(type)
        type === 1 ? setUp(v => v + 1) : setDown(v => v + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vote-buttons">
      <button
        className={`vote-btn${myVote === 1 ? ' voted-up' : ''}`}
        onClick={() => vote(1)}
        disabled={!isAuthenticated || busy}
        title={!isAuthenticated ? t('vote.signInRequired') : t('vote.upvote')}
      >
        👍 <span>{up}</span>
      </button>
      <button
        className={`vote-btn${myVote === -1 ? ' voted-down' : ''}`}
        onClick={() => vote(-1)}
        disabled={!isAuthenticated || busy}
        title={!isAuthenticated ? t('vote.signInRequired') : t('vote.downvote')}
      >
        👎 <span>{down}</span>
      </button>
    </div>
  )
}
