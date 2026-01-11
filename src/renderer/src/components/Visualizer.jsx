import Tree from './Tree'
import { useState, useEffect } from 'react'

const Visualizer = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchRoadmap = async () => {
      try {
        const response = await window.api.generateRoadmap({
          topic: 'rust programming',
          level_description:
            'I know computer science concepts like data structures but I have no knowledge on how to use rust',
          end_goal: 'I want to create a custom socket in rust'
        })

        // IMPORTANT: The response is already { startNodes, skillNodes }
        setData(response) 
      } catch (err) {
        console.error("Roadmap Fetch Error:", err)
        setError('Failed to generate roadmap')
      } finally {
        setLoading(false)
      }
    }

    if (!window.api?.generateRoadmap) {
      setError('Not running in Electron / preload not loaded.')
      setLoading(false)
      return
    }

    fetchRoadmap()
  }, [])

  // 1. Updated Validation to match your actual backend return keys
  const validateInput = (input) => {
    if (!input || !input.startNodes || !input.skillNodes) {
      console.error('Invalid input: missing startNodes or skillNodes', input)
      return false
    }
    return true
  }

  // 2. Updated Processing to map the flat arrays into the structure Tree.jsx needs
  const processData = (input) => {
    if (!validateInput(input)) return null

    return {
      root: {
        id: 'root',
        type: 'root'
      },
      // Map 'levelIndex' or 'difficulty' fields to ensure consistency
      startNodes: input.startNodes.map(node => ({
        ...node,
        type: 'difficulty',
        // Tree component usually expects a 'difficulty' key or similar
        difficulty: node.levelIndex ?? 0 
      })),
      skillNodes: input.skillNodes.map(skill => ({
        ...skill,
        type: 'skill',
        // Use summary if description is missing
        summary: skill.description || skill.summary || ''
      }))
    }
  }

  const processedData = processData(data)

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-4 text-xl">Generating your Rust roadmap...</span>
        </div>
      ) : error ? (
        <div className="bg-red-900/50 border border-red-500 p-4 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      ) : processedData ? (
        <div>
          <header className="mb-8 border-b border-gray-700 pb-4">
            <h2 className="text-2xl font-bold text-blue-400">Roadmap Overview</h2>
            <div className="flex gap-6 mt-2 text-gray-300">
              <p>📍 Difficulty Tiers: <span className="text-white font-mono">{processedData.startNodes.length}</span></p>
              <p>✅ Total Skills: <span className="text-white font-mono">{processedData.skillNodes.length}</span></p>
            </div>
          </header>
          
          <div className="relative overflow-auto">
            <Tree processedData={processedData} />
          </div>
        </div>
      ) : (
        <div className="text-yellow-500 italic">
          Data received but format was incompatible.
        </div>
      )}
    </div>
  )
}

export default Visualizer