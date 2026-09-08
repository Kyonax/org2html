/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/parser/ast.ts — AST node factories.
 *
 * createNode / createTextNode / createDocument. Factories
 * spread `properties` and `children` conditionally so JSON
 * serialization of leaf nodes stays compact.
 */

import type { AstNode, NodeType, OrgAst, OrgMetadata } from '../types.js'

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

export function createDocument(metadata: OrgMetadata, children: AstNode[]): OrgAst {
  return {
    type: 'document',
    metadata,
    children,
  }
}
