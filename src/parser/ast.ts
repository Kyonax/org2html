import type { AstNode, NodeType, OrgMetadata } from '../types.js'

export function createNode(
  type: NodeType,
  properties?: Record<string, any>,
  children?: AstNode[]
): AstNode {
  return {
    type,
    ...(properties && { properties }),
    ...(children && { children }),
  }
}

export function createTextNode(value: string): AstNode {
  return {
    type: 'text',
    value,
  }
}

export function createDocument(metadata: OrgMetadata, children: AstNode[]): AstNode {
  return {
    type: 'document',
    metadata,
    children,
  }
}
