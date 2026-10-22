import path from 'node:path';
import { promises as fs } from 'node:fs';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { parse } from 'acorn';
import { transformSync } from 'esbuild';

// Hot code: syntax/identifier obfuscation only, with no per-frame decoding,
// flattened render loops, eval, debug traps or changes to public properties.
// Replace string literals with direct accesses to a pool decoded ONCE at load.
// This is obfuscation, not encryption with a secret key: the client has both.
export function hideBundleStrings(source) {
  const tree = parse(source, {ecmaVersion:'latest',sourceType:'script'});
  const values = [], indexes = new Map(), edits = [];
  const add = value => {
    if (!indexes.has(value)) { indexes.set(value, values.length);values.push(value); }
    return indexes.get(value);
  };
  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    const literal = node.type === 'Literal' && typeof node.value === 'string';
    const template = node.type === 'TemplateLiteral' && node.expressions.length === 0;
    if (literal || template) {
      // Directives must remain directives; tagged templates need raw strings.
      if (parent?.directive || parent?.type === 'TaggedTemplateExpression') return;
      if (literal && node.value === '__proto__' && parent?.key === node && !parent.computed) return;
      const access = '(__pcStringPool[' + add(literal ? node.value : node.quasis[0].value.cooked) + '])';
      const key = parent?.key === node && !parent.computed;
      edits.push({ start: node.start, end: node.end, value: key ? '[' + access + ']' : access });
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) visit(child,node);
      else if (value && typeof value === 'object') visit(value,node);
    }
  };
  visit(tree);
  if (!values.length) return source;
  let patched = source;
  for (const edit of edits.sort((a,b) => b.start-a.start)) patched = patched.slice(0,edit.start)+edit.value+patched.slice(edit.end);
  const encoded = values.map((text,index) => {
    const bytes = Buffer.alloc(text.length*2);
    for(let n=0;n<text.length;n++) bytes.writeUInt16LE(text.charCodeAt(n)^((38747+index*131+n*34)&65535),n*2);
    return bytes.toString('base64');
  });
  const decoder = 'const __pcStringPool=Object.freeze('+JSON.stringify(encoded)+'.map((s,i)=>{const b=atob(s);let result="";for(let n=0;n<b.length;n+=2)result+=String.fromCharCode((b.charCodeAt(n)|(b.charCodeAt(n+1)<<8))^((38747+i*131+n*17)&65535));return result}));';
  // The initializer is cold code; stronger transformations stay outside frames.
  const cold = JavaScriptObfuscator.obfuscate(decoder, {
    target:'browser-no-eval', compact:true, renameGlobals:false, renameProperties:false,
    controlFlowFlattening:true, controlFlowFlatteningThreshold:1, numbersToExpressions:true,
    stringArray:false, selfDefending:false, debugProtection:false, disableConsoleOutput:false, seed:856031,
    reservedNames:['^__pcStringPool$'],
  }).getObfuscatedCode();
  return '(()=>{'+cold+'\n'+patched+'\n})();';
}

export function obfuscateBundle(source, profile = 'strings') {
  if (!['light','strings'].includes(profile)) throw Error('Unsupported obfuscation profile: '+profile);
  if (profile === 'strings') source = hideBundleStrings(source);
  return JavaScriptObfuscator.obfuscate(source, {
    target: 'browser-no-eval', compact: true,
    identifierNamesGenerator: 'hexadecimal', renameGlobals: false, renameProperties: false,
    controlFlowFlattening: false, deadCodeInjection: false, stringArray: false,
    splitStrings: false, numbersToExpressions: false, transformObjectKeys: false,
    simplify: false, unicodeEscapeSequence: true,
    selfDefending: false, debugProtection: false, disableConsoleOutput: false,
    sourceMap: false, seed: 856031,
  }).getObfuscatedCode();
}

/** @returns {import('vite').Plugin} */
export function bundleObfuscationPlugin(outDir, files = ['script.js']) {
  let enabled = false, experimental = false;
  return {
    name: 'pulsecolor-bundle-obfuscation',
    enforce: 'pre',
    configResolved(config) {
      enabled = config.mode !== 'development';
      experimental = enabled && (process.env.PULSECOLOR_OBFUSCATION || 'strings') === 'strings';
    },
    transform(source,id) {
      const file = id.split(String.fromCharCode(92)).join('/');
      if (!experimental || !/\/src\/(?:main|theme|runtime\/bootstrap)\.ts$/.test(file)) return null;
      const js = transformSync(source,{loader:'ts',format:'esm',target:'es2022'}).code;
      const code = JavaScriptObfuscator.obfuscate(js,{
        target:'browser-no-eval',compact:true,renameGlobals:false,renameProperties:false,
        controlFlowFlattening:true,controlFlowFlatteningThreshold:.75,
        stringArray:true,stringArrayEncoding:['base64'],stringArrayThreshold:1,
        deadCodeInjection:false,selfDefending:false,debugProtection:false,disableConsoleOutput:false,
        sourceMap:false,seed:856031,
      }).getObfuscatedCode();
      return {code,map:null};
    },
    closeBundle: { order: 'post', sequential: true, async handler() {
      if (!enabled) return;
      for (const file of files) {
        const target = path.join(outDir, file);
        const source = await fs.readFile(target, 'utf8');
        await fs.writeFile(target, obfuscateBundle(source, process.env.PULSECOLOR_OBFUSCATION || 'strings'));
      }
    } },
  };
}

