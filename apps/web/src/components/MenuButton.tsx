import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { I } from './icons';

/** 덱 밖에 새로 온 것이 있는가(새 소식, 끝난 코딩 세션) — 메뉴 단추의 잉크 점이 알려요. 빨강 배지는 쓰지 않아요 */
export const MenuDot = createContext(false);

/** <MenuButton> — 왼쪽 패널을 대신하는 단추예요. 모든 화면의 왼쪽 위 같은 자리에 있어요 */
export function MenuButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  const dot = useContext(MenuDot);
  return (
    <button type="button" className="cu-ib menu" onClick={onClick} aria-label={t('side.menu')} aria-keyshortcuts="[" aria-haspopup="dialog" data-dot={dot || undefined}>
      <I.list aria-hidden />{dot && <i className="dot" aria-hidden />}
    </button>
  );
}
