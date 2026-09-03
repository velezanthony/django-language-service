/** Same pattern and flags, own `lastIndex`. `new RegExp(re.source, 'g')` silently drops the rest. */
export function freshRegex(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags);
}
