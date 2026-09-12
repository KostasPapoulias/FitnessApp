import { Component, ReactNode } from 'react'
import { reportClientError } from '../lib/clientErrors'

// Catches a failed lazy chunk before the page boundary does, so one missing
// download cannot replace a live workout screen.

interface Props {
  children: ReactNode
  /** Rendered in place of the child. Gets a retry that remounts it. */
  fallback: (retry: () => void) => ReactNode
  /** Names the chunk in the report, so "which one failed" is not a guess. */
  label: string
}

interface State {
  failed: boolean
}

export default class ChunkBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error): void {
    // Reported, not swallowed: a chunk that cannot be fetched is usually a
    // deploy problem, and it is invisible from the server side.
    reportClientError({ error, boundary: `chunk:${this.props.label}` })
  }

  render(): ReactNode {
    if (this.state.failed) {
      // Remounting the child re-runs the import, which is the whole point —
      // React.lazy retries a rejected loader on the next mount.
      return this.props.fallback(() => this.setState({ failed: false }))
    }
    return this.props.children
  }
}
