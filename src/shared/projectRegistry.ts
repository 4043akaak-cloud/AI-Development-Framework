export interface RegisteredProject {
  id: string
  name: string
  repositoryRoot: string
}

export const adfRepositoryRoot = '/Users/kawakamiatsushishi/GitHub/AI-Development-Framework'
export const blockDefenseRepositoryRoot = '/Users/kawakamiatsushishi/GitHub/block-defense'

export const registeredProjects: readonly RegisteredProject[] = [
  { id: 'adf', name: 'AI Development Framework', repositoryRoot: adfRepositoryRoot },
  { id: 'block-defense', name: 'Block Defense', repositoryRoot: blockDefenseRepositoryRoot }
]

export function registeredProjectFor(projectId: string): RegisteredProject | undefined {
  return registeredProjects.find((project) => project.id === projectId)
}
