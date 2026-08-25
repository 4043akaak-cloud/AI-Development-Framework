import type { JSX } from 'react'
import FrontdoorPanel from './FrontdoorPanel'
import './styles.css'

/**
 * Owner-facing MVP shell.
 *
 * Runtime, Ledger, Approval and Adapter capabilities remain behind the
 * Frontdoor. The primary surface only exposes the collaboration loop and its
 * progress so the Owner can see whether AI participants are working together.
 */
export default function App(): JSX.Element {
  return (
    <main className="mvp-shell">
      <header className="mvp-header">
        <div>
          <p className="eyebrow">ADF · AI COLLABORATION MVP</p>
          <h1>ADF Project Board</h1>
          <p>AI Development Frameworkの1プロジェクト全体を、協業状態・進捗・成果物・次のActionで確認する画面です。</p>
        </div>
        <div className="mvp-purpose" aria-label="ADF MVPの目的">
          <strong>AI協業を監視</strong>
          <span>Project全体を確認</span>
        </div>
      </header>

      <FrontdoorPanel minimal />
    </main>
  )
}
