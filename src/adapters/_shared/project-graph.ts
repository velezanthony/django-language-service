/**
 * graphFor — per-Project-snapshot ModelGraph memoization.
 *
 * The Scanner freezes a NEW Project object on every scan, so identity is the
 * correct cache key: same snapshot → same graph (built once, shared by every
 * adapter request); new snapshot → the WeakMap entry for the old one is
 * garbage-collected along with it. Never build a graph per keystroke.
 */
import type { Project } from '$infra/types/project';
import { createModelGraph, type ModelGraph } from '$domain/view-context';

const cache = new WeakMap<Project, ModelGraph>();

export function graphFor(project: Project): ModelGraph {
  let graph = cache.get(project);
  if (!graph) {
    graph = createModelGraph(project.models.all());
    cache.set(project, graph);
  }
  return graph;
}
