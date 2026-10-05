const { lineIndex, lineAt } = require('../utils/text');

const LIBS = [
  { lib: 'redux', re: /createSlice\(|createStore\(|configureStore\(|useSelector\(|useDispatch\(|combineReducers\(/ },
  { lib: 'zustand', re: /from\s+['"]zustand|\bcreate\(\s*\(?set/ },
  { lib: 'react-context', re: /createContext\(|useContext\(/ },
  { lib: 'vuex/pinia', re: /defineStore\(|createStore\(\s*\{|useStore\(\)|mapState\(/ },
  { lib: 'mobx', re: /makeObservable|makeAutoObservable|observer\(/ },
  { lib: 'recoil/jotai', re: /\batom\(|useRecoilState|useAtom\(/ },
  { lib: 'react-query', re: /useQuery\(|useMutation\(|QueryClient/ },
  { lib: 'react-state', re: /\buseState\(|useReducer\(/ },
  { lib: 'ngrx', re: /createAction\(|createReducer\(|@ngrx/ },
];

function analyzeState(content) {
  const starts = lineIndex(content);
  const out = [];
  for (const l of LIBS) {
    const m = l.re.exec(content);
    if (m) out.push({ library: l.lib, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
  }
  const setters = [...content.matchAll(/const\s+\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState/g)].map((m) => ({ state: m[1], setter: m[2], line: lineAt(starts, m.index) }));
  return { libraries: out, localState: setters };
}

module.exports = { analyzeState };
