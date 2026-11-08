// Shared helper for the fallback plugins (viewport-fallback.cjs and
// color-mix-fallback.cjs).
//
// Fallbacks go into an `@supports not (<feature>)` copy of the rule placed
// directly after it, instead of a duplicate declaration in front of the
// original:
// - a declaration whose value contains var() is valid at parse time even when
//   the browser lacks the feature, so it would override an earlier fallback
//   and then fail at computed-value time (the property becomes unset);
// - the CSS minifier removes "duplicate" declarations within one rule.
// Browsers that support the feature skip the @supports-not block entirely, so
// modern rendering is unchanged. Old browsers apply the fallback after the
// original rule, with the same selector and therefore the same specificity.

function addFallbackBlocks(root, { AtRule }, supportsCondition, collect) {
  const byRule = new Map();
  root.walkDecls((decl) => {
    const fallback = collect(decl);
    if (fallback === null || fallback === decl.value) return;
    if (decl.parent?.type !== "rule") return;
    const list = byRule.get(decl.parent) ?? [];
    list.push(decl.clone({ value: fallback }));
    byRule.set(decl.parent, list);
  });
  for (const [rule, decls] of byRule) {
    const override = rule.clone({ nodes: [] });
    for (const decl of decls) override.append(decl);
    const supports = new AtRule({ name: "supports", params: supportsCondition });
    supports.append(override);
    rule.after(supports);
  }
}

function insideSupports(node, pattern) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule" && parent.name === "supports" && pattern.test(parent.params)) {
      return true;
    }
  }
  return false;
}

/**
 * For CSS that already feature-tests itself (e.g. Tailwind's
 * `.x{color:opaque}@supports (color:color-mix(...)){.x{color:mix}}`), adds
 * `@supports not (<same test>) { .x { color: fallback } }` right after the
 * block, so browsers that fail the test get an accurate value instead of the
 * opaque one. Browsers that pass the test skip the new block.
 */
function addFallbackAfterSupportsBlocks(root, { AtRule }, conditionPattern, collect) {
  const blocks = [];
  root.walkAtRules("supports", (atRule) => {
    const params = atRule.params.trim();
    if (!conditionPattern.test(params) || /^not\b/i.test(params)) return;
    const overrides = [];
    atRule.each((node) => {
      if (node.type !== "rule") return;
      const decls = [];
      node.each((decl) => {
        if (decl.type !== "decl") return;
        const fallback = collect(decl);
        if (fallback !== null && fallback !== decl.value) decls.push(decl.clone({ value: fallback }));
      });
      if (decls.length) {
        const override = node.clone({ nodes: [] });
        for (const decl of decls) override.append(decl);
        overrides.push(override);
      }
    });
    if (overrides.length) blocks.push([atRule, params, overrides]);
  });
  for (const [atRule, params, overrides] of blocks) {
    const negated = new AtRule({ name: "supports", params: `not ${params}` });
    for (const override of overrides) negated.append(override);
    atRule.after(negated);
  }
}

module.exports = { addFallbackAfterSupportsBlocks, addFallbackBlocks, insideSupports };
