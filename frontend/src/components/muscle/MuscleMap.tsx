import { useEffect, useMemo, useRef } from 'react'
import { useFatigueStore } from '../../store/useFatigueStore'
import frontSvg from '../../assets/front5.svg?raw'
import backSvg from '../../assets/back5.svg?raw'

// Map SVG group IDs to database muscle names
const MUSCLE_ID_MAP: Record<string, string> = {
  Traps: 'Traps',
  Shoulders: 'Shoulders',
  Chest: 'Chest',
  Biceps: 'Biceps',
  Abs: 'Abs',
  Forearms: 'Forearms',
  Quads: 'Quadriceps',
  Calves: 'Calves',
  Triceps: 'Triceps',
  Lats: 'Lats',
  Glutes: 'Glutes',
  Hamstrings: 'Hamstrings'
}

interface MuscleMapProps {
  side: 'front' | 'back'
}

export default function MuscleMap({ side }: MuscleMapProps) {
  const { muscles, selectMuscle } = useFatigueStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const svgMarkup = useMemo(() => {
    return side === 'front' ? frontSvg : backSvg
  }, [side])

  const colorMap = useMemo(() => {
    return new Map(muscles.map(m => [m.muscleName, m.color]))
  }, [muscles])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const svgEl = container.querySelector('svg')
    if (svgEl) {
      svgEl.classList.add('w-full', 'h-full')
    }

    Object.entries(MUSCLE_ID_MAP).forEach(([groupId, muscleName]) => {
      const group = container.querySelector(`#${CSS.escape(groupId)}`)
      if (!group) return
      const color = colorMap.get(muscleName) ?? '#2A2A2A'
      group.querySelectorAll<SVGElement>('path, ellipse, rect, polygon').forEach((el) => {
        el.setAttribute('fill', color)
        el.style.cursor = 'pointer'
        el.style.transition = 'fill 0.4s ease'
      })
    })
  }, [colorMap, svgMarkup])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const group = target?.closest('g[id]') as SVGGElement | null
      if (!group) return

      const muscleName = MUSCLE_ID_MAP[group.id]
      if (!muscleName) return

      const muscle = muscles.find(m => m.muscleName === muscleName)
      if (muscle) selectMuscle(muscle)
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [muscles, selectMuscle])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  )
}