import { useContext } from 'react'
import { DemoContext } from '../context/DemoContext.jsx'

export function useDemo() {
  const context = useContext(DemoContext)
  if (!context) throw new Error('useDemo requires DemoProvider')
  return context
}
