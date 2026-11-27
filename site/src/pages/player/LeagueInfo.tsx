import { Link, useNavigate, useParams } from 'react-router'
import pages from 'virtual:league-info'
import '../../content/league-info.css'

export function LeagueInfo() {
  const { page } = useParams()
  // The section entry and unknown page keys follow the prototype's format default.
  const current = pages.find((entry) => entry.key === page) ?? pages[0]!
  const navigate = useNavigate()
  return <>
    <div className="kicker">League info</div>
    <div className="league-info">
      <label className="league-info-pick">Section
        <select value={current.key} onChange={(e) => navigate(`/info/${e.target.value}`)}>
          {pages.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
      </label>
      <nav className="league-info-nav" aria-label="League info pages">
        {pages.map((entry) => <Link
          key={entry.key}
          to={`/info/${entry.key}`}
          aria-current={entry.key === current.key ? 'page' : undefined}
          className={entry.key === current.key ? 'selected' : ''}
        >{entry.label}</Link>)}
      </nav>
      <article className="league-info-prose" aria-label={current.label} dangerouslySetInnerHTML={{ __html: current.html }} />
    </div>
  </>
}
