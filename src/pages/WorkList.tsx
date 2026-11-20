import { Link } from 'react-router'
import Unsupported from '../components/Unsupported'
import { useEmbed } from '../useEmbed'
import { useWebGPUSupport } from '../useWebGPUSupport'
import { works } from '../works'

export default function WorkList() {
  const embed = useEmbed()
  const support = useWebGPUSupport()

  return (
    <div className="page">
      {!embed && (
        <header className="header">
          <h1>Gallery</h1>
        </header>
      )}
      {support !== 'checking' && support !== 'supported' && <Unsupported status={support} compact />}
      <ul className="grid">
        {works.map(({ id, module: { meta } }) => (
          <li key={id}>
            <Link to={`/works/${id}`} className="card">
              <img src={meta.thumbnail} alt="" loading="lazy" />
              <div className="card-body">
                <h2>{meta.title}</h2>
                <p>{meta.description}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
