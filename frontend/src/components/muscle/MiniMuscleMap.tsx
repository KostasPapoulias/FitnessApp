import { useMemo } from 'react'
import front5 from '../../assets/front5.svg?raw'
import back5 from '../../assets/back5.svg?raw'

const MUSCLE_NAME_TO_GROUP: Record<string, string[]> = {
  'Quadriceps': ['Quads'],
  'Hamstrings': ['Hamstrings'],
  'Glutes': ['Glutes'],
  'Calves': ['Calves'],
  'Chest': ['Chest'],
  'Lats': ['Lats'],
  'Back': ['Lats'],
  'Traps': ['Traps'],
  'Lower Back': ['Lats'],
  'Shoulders': ['Shoulders'],
  'Biceps': ['Biceps'],
  'Triceps': ['Triceps'],
  'Forearms': ['Forearms'],
  'Abs': ['Abs'],
  'Obliques': ['Abs'],
}

interface FatigueSnapshotItem {
  muscleName: string
  fatigueLevelAfter: number
  color: string
}

interface MiniMuscleMapProps {
  fatigueSnapshot: FatigueSnapshotItem[]
}

const decorateSvg = (svg: string, css: string) => {
  const withoutHeaders = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
  const withoutTextNodes = withoutHeaders.replace(/>[^<]+</g, '><')
  const withClass = withoutTextNodes.replace(/<svg\b([^>]*)>/, (_match, attrs) => {
    if (/\bclass=/.test(attrs)) {
      return `<svg${attrs.replace(/\bclass="([^"]*)"/, ' class="$1 w-full h-full"')}>`
    }
    return `<svg${attrs} class="w-full h-full">`
  })

  return withClass.replace(/<svg\b([^>]*)>/, (match) => `${match}<style>${css}</style>`)
}

export default function MiniMuscleMap({ fatigueSnapshot }: MiniMuscleMapProps) {
  const svgCss = useMemo(() => {
    const colorMap = new Map<string, string>()

    fatigueSnapshot.forEach((item) => {
      const groupIds = MUSCLE_NAME_TO_GROUP[item.muscleName] ?? []
      groupIds.forEach((id) => colorMap.set(id, item.color))
    })

    const rules = ['path { fill: #2A2A2A; }']
    colorMap.forEach((color, id) => {
      rules.push(`#${id} { fill: ${color}; }`)
      rules.push(`#${id} path { fill: ${color}; }`)
    })

    return rules.join('\n')
  }, [fatigueSnapshot])

  const frontSvg = useMemo(() => decorateSvg(front5, svgCss), [svgCss])
  const backSvg = useMemo(() => decorateSvg(back5, svgCss), [svgCss])

  return (
    <div className="flex  gap-1">
      <div className="w-34 h-40" aria-label="Front muscle map" dangerouslySetInnerHTML={{ __html: frontSvg }} />
      <div className="w-34 h-40" aria-label="Back muscle map" dangerouslySetInnerHTML={{ __html: backSvg }} />
    </div>
  )
}