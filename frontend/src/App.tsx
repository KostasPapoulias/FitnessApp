import { BrowserRouter as Router } from 'react-router-dom'
import { useEffect } from 'react'

export default function App() {
  useEffect(() => {
    // Initialize app
    document.title = 'SomaTrack'
  }, [])

  return (
    <Router>
      <div className="w-full h-screen bg-bg-primary text-text-primary">
        <div className="max-w-sm mx-auto h-full flex flex-col">
          {/* Routes will go here */}
          <div className="flex-1 overflow-auto">
            <div className="p-4">
              <h1 className="text-2xl font-bold mb-4">SomaTrack</h1>
              <p className="text-text-secondary mb-4">Mobile-first Fitness & Recovery Tracking</p>
              <p className="text-text-muted text-sm">App initialization in progress...</p>
            </div>
          </div>
        </div>
      </div>
    </Router>
  )
}
