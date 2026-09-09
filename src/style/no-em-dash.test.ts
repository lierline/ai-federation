import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// =============================================================================
// 글쓰기 가드: 짝대기(U+2014 em dash) 금지. 전수, 예외는 이유와 함께 선언
// =============================================================================
// 오빠가 저장소 전역에서 이 문자를 금지했다.
//
// 🔴 2026-09-09 신설 이유. 이 저장소에서 65곳을 지웠는데 **재발을 막는 것이 아무것도
//    없었다.** 그리고 이 저장소는 **public** 이다: 남는 것이 곧 공개된다.
//
// 🔴 `dist` 도 본다. 이 패키지는 빌드 산출물을 커밋하므로, `src` 만 고치고 빌드를 안 하면
//    **공개되는 쪽은 옛 문자를 그대로 담는다.** 실제로 2026-09-09 에 src 를 정리한 뒤에도
//    dist 에 18곳이 남아 있었다(다른 스캐너가 dist 를 산출물이라고 건너뛰어 못 봤다).
//    여기서 걸리면 지우는 게 아니라 **`pnpm build` 를 돌릴 것.**
//
// ⚠️ **grep 으로 검사하면 거짓 초록이 난다.** 유니코드 표기가 해석되지 않아 언제나 0곳이
//    나온다. 그래서 이 가드는 문자 단위로 센다.
// 🔑 **HTML 엔티티 형태도 함께 본다.**
// ⚠️ 이 파일 안에서는 그 문자를 **리터럴로 쓰지 않는다.** 쓰면 가드가 자기 자신을 잡는다.

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'docs', 'dist'];
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.md', '.json'];
const SKIP_DIRS = new Set(['node_modules', '.git']);

const EM_DASH = '\u2014';
const ENTITY = '&' + 'mdash;';

/**
 * 면제. **이유가 없으면 검사가 막는다.**
 * 지금은 비어 있다. 그래도 표를 지우지 않는다: 다음에 예외를 두는 사람이
 * **이유를 적도록 강제하는 자리** 가 필요하다.
 */
interface Exemption {
  readonly path: string;
  readonly count: number;
  readonly why: string;
}

const EXEMPT: readonly Exemption[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...walk(full));
    } else if (EXTS.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function rel(full: string): string {
  return relative(ROOT, full).split(sep).join('/');
}

function exemptionFor(path: string): Exemption | undefined {
  return EXEMPT.find((e) => path === e.path || path.startsWith(e.path + '/'));
}

interface Hit {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

function scan(): { hits: Hit[]; perFile: Map<string, number> } {
  const hits: Hit[] = [];
  const perFile = new Map<string, number>();
  for (const dir of SCAN_DIRS) {
    for (const full of walk(join(ROOT, dir))) {
      const path = rel(full);
      let src: string;
      try {
        src = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (!src.includes(EM_DASH) && !src.includes(ENTITY)) continue;
      src.split('\n').forEach((text, i) => {
        const n = text.split(EM_DASH).length - 1 + (text.split(ENTITY).length - 1);
        if (n === 0) return;
        perFile.set(path, (perFile.get(path) ?? 0) + n);
        hits.push({ path, line: i + 1, text: text.trim().slice(0, 100) });
      });
    }
  }
  return { hits, perFile };
}

describe('짝대기(em dash) 금지', () => {
  it('면제는 반드시 이유를 적는다', () => {
    for (const e of EXEMPT) {
      expect(e.why.trim().length, `${e.path} 에 이유가 없다`).toBeGreaterThan(20);
    }
  });

  it('스캐너가 실제로 이 문자를 잡는다(자기 검증)', () => {
    const probe = `a ${EM_DASH} b ${EM_DASH} c`;
    expect(probe.split(EM_DASH).length - 1).toBe(2);
    expect(`x ${ENTITY} y`.split(ENTITY).length - 1).toBe(1);
  });

  it('스캔 대상이 실재한다', () => {
    // 스캔이 0파일이면 아래 검사가 «전부 통과» 로 보인다. 그 죽음을 먼저 막는다.
    const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
    expect(files.length, '스캔한 파일이 없다. SCAN_DIRS 가 낡았는지 볼 것').toBeGreaterThan(20);
  });

  it('면제 목록에 없는 곳에는 한 개도 없다', () => {
    const { hits } = scan();
    const offenders = hits.filter((h) => !exemptionFor(h.path));
    const report = offenders.map((h) => `  ${h.path}:${h.line}  ${h.text}`).join('\n');
    expect(
      offenders.length,
      `짝대기가 ${offenders.length}곳 있다. dist 에서 걸렸다면 «pnpm build» 를 돌릴 것. ` +
        `src 라면 지우거나, 지우면 안 되는 이유를 EXEMPT 에 적을 것:\n${report}`,
    ).toBe(0);
  });

  it('면제된 곳도 개수가 늘지 않는다', () => {
    const { perFile } = scan();
    for (const e of EXEMPT) {
      if (e.count === Number.POSITIVE_INFINITY) continue;
      const actual = perFile.get(e.path) ?? 0;
      expect(
        actual,
        `${e.path}: 면제 ${e.count}개로 선언했는데 실제 ${actual}개다.`,
      ).toBe(e.count);
    }
  });

  it('면제 항목은 실재하는 경로여야 한다', () => {
    for (const e of EXEMPT) {
      expect(() => statSync(join(ROOT, e.path)), `${e.path} 가 없다`).not.toThrow();
    }
  });
});
