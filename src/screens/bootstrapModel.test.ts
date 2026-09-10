import { describe, expect, it } from 'vitest';
import { bootstrapViewOf } from './bootstrapModel';

describe('bootstrapViewOf', () => {
  it('로드 중에는 로딩 화면', () => {
    expect(bootstrapViewOf({ loading: true, loadFailed: false })).toBe('loading');
  });

  it('온보딩을 안 끝낸 새 계정에는 온보딩', () => {
    expect(bootstrapViewOf({ loading: false, loadFailed: false })).toBe('onboarding');
  });

  // 이 앱에서 실제로 있었던 버그를 고정한다. 프로필 조회가 실패하면 profile이 null이 되는데,
  // 그때 온보딩을 띄우면 기존 사용자가 자기 프로필을 덮어쓴다(초대코드 재발급, 과목 색 초기화,
  // 소셜 계정은 역할까지 바뀜). 로드 실패는 절대 온보딩으로 가서는 안 된다.
  it('로드 실패는 온보딩이 아니라 실패 화면으로 간다', () => {
    expect(bootstrapViewOf({ loading: false, loadFailed: true })).toBe('load-failed');
    expect(bootstrapViewOf({ loading: false, loadFailed: true })).not.toBe('onboarding');
  });

  it('재시도가 로딩을 다시 켜는 순간에는 로딩이 이긴다', () => {
    expect(bootstrapViewOf({ loading: true, loadFailed: true })).toBe('loading');
  });
});
