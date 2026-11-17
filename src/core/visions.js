/** Visions without the page: the tree, loops, goals serving them, Purpose, and merging two lists. */
import { visions } from './state';

export const findVision = id => visions.list.find(v => v.id === id);
