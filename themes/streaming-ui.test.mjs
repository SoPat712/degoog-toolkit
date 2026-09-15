import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

for (const theme of ['literallygoogle', 'literallyapple']) {
    const source = await readFile(new URL(`./${theme}/scripts/search.js`, import.meta.url), 'utf8');
    const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

    test(`${theme}: a streaming batch restores display before returning, including errors`, () => {
        for (const previous of ['', 'grid', 'none']) {
            const values = new Map(previous ? [['display', previous]] : []);
            let layoutReads = 0;
            const list = {
                isConnected: true,
                style: {
                    getPropertyValue: key => values.get(key) || '',
                    getPropertyPriority: () => previous ? 'important' : '',
                    setProperty: (key, value) => values.set(key, value),
                    removeProperty: key => values.delete(key),
                },
                getBoundingClientRect() { layoutReads++; return {}; },
            };
            const context = vm.createContext({ getResultsList: () => list, getResultsPage: () => ({dataset:{}}), performance: {now:()=>0} });
            vm.runInContext(section('function runStreamingRenderBatch(', 'function onReady('), context);
            const result = context.runStreamingRenderBatch(() => {
                assert.equal(values.get('display'), 'none');
                return 42;
            });
            assert.equal(result, 42);
            assert.equal(values.get('display') || '', previous);
            assert.equal(layoutReads, 1);
            assert.throws(() => context.runStreamingRenderBatch(() => { throw new Error('renderer failed'); }), /renderer failed/);
            assert.equal(values.get('display') || '', previous);
            assert.equal(layoutReads, 2);
        }
    });

    test(`${theme}: engine accordions toggle once and preserve choice through replacement`, () => {
        const makePanel = () => {
            const classes = new Set();
            const attrs = new Map();
            const toggle = {setAttribute:(k,v)=>attrs.set(k,v), closest:()=>panel};
            const panel = {
                classList: {contains:k=>classes.has(k), toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
                querySelector:()=>toggle,
            };
            return {panel, toggle, attrs};
        };
        const rootAttrs = new Map();
        let click;
        const root = {
            hasAttribute:k=>rootAttrs.has(k), setAttribute:(k,v)=>rootAttrs.set(k,v),
            getAttribute:k=>rootAttrs.get(k) ?? null, contains:()=>true,
            addEventListener:(name,fn,capture)=>{assert.equal(capture,true);click=fn;},
        };
        const context = vm.createContext({
            USER_ATTR_ENGINE:'engine-choice', USER_ATTR_RELATED:'related-choice', USER_ATTR_KNOWLEDGE:'knowledge-choice',
            isEnginePerformancePanel:()=>true, isRelatedSearchesPanel:()=>false, isKnowledgePanel:()=>false,
            getEngineMode:()=> 'open', isSearching:()=>true, shouldEngineBeOpen:()=>true,
            MutationObserver:class {observe() {}},
        });
        vm.runInContext(section('    function syncEngineAccordion(', '    function syncRelatedAccordion(') + section('    function bindSidebar(', '    function observeSearchLifecycle('), context);
        context.bindSidebar(root);
        let {panel,toggle,attrs} = makePanel();
        const activate = () => {
            let stopped = false;
            click({target:{closest:()=>toggle}, preventDefault(){}, stopPropagation(){stopped=true;}});
            assert.ok(stopped, 'native duplicate listeners must not also toggle');
        };
        activate();
        assert.equal(panel.classList.contains('open'), true);
        assert.equal(attrs.get('aria-expanded'), 'true');
        activate();
        assert.equal(panel.classList.contains('open'), false);
        assert.equal(rootAttrs.get('engine-choice'), 'false');
        ({panel,toggle,attrs} = makePanel());
        context.syncEngineAccordion(panel,root);
        assert.equal(panel.classList.contains('open'), false, 'stream completion must not override a manual collapse');
        assert.equal(attrs.get('aria-expanded'), 'false');
    });
}
