import { Component, ReactNode } from 'react'
import { reportClientError } from '../lib/clientErrors'

// Catches a failed lazy-chunk load locally, so one failed download cannot replace a live screen.

interface Props {
  children: ReactNode
  /** Rendered in place of the child. Gets a retry that remounts it. */
  fallback: (retry: () => void) => ReactNode
  /** Names the chunk in the error report. */
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
    // Reported: an unfetchable chunk is usually a deploy problem
    reportClientError({ error, boundary: `chunk:${this.props.label}` })
  }

  render(): ReactNode {
    if (this.state.failed) {
      // Remounting re-runs the import (React.lazy retries a rejected loader)
      return this.props.fallback(() => this.setState({ failed: false }))
    }
    return this.props.children
  }
}
