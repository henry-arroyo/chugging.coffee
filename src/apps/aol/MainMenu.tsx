/** AOL 2.5's Main Menu: the department buttons and the Spotlight, Post Office and Discover AOL corner. */
import { assetUrl, iconUrl } from '../../shell/icons';
import { DEPARTMENTS, type Department } from './departments';

interface MainMenuProps {
  onDepartment: (d: Department) => void;
  onSpotlight: () => void;
  onPostOffice: () => void;
  onDiscover: () => void;
  onMemberServices: () => void;
}

export function MainMenu({ onDepartment, onSpotlight, onPostOffice, onDiscover, onMemberServices }: MainMenuProps) {
  const square = (id: string, label: string, onClick: () => void) => (
    <button type="button" className="aol-corner-button" onClick={onClick}>
      <span className="aol-corner-picture">
        <img src={assetUrl(id) ?? ''} alt="" width={40} height={40} draggable={false} />
      </span>
      <span className="aol-corner-label">{label}</span>
    </button>
  );
  return (
    <div className="aol-mainmenu">
      <div className="aol-mainmenu-left">
        <div className="aol-mainmenu-logo">
          <img className="aol-mainmenu-ghost" src={iconUrl('icon.aol')} alt="" width={96} height={96} draggable={false} />
          <img className="aol-mainmenu-mark" src={assetUrl('aol.wordmark-red') ?? ''} alt="America Online" width={135} height={66} draggable={false} />
        </div>
        {square('aol.menu-spotlight', 'IN THE SPOTLIGHT', onSpotlight)}
        {square('aol.menu-postoffice', 'POST OFFICE', onPostOffice)}
        {square('aol.menu-discover', 'DISCOVER AOL', onDiscover)}
        <button type="button" className="aol-member-services" onClick={onMemberServices}>
          MEMBER SERVICES
        </button>
      </div>
      <div className="aol-mainmenu-right">
        <div className="aol-mainmenu-title">MAIN MENU</div>
        <div className="aol-departments">
          {DEPARTMENTS.map((column, c) => (
            <div key={c} className="aol-department-column">
              {column.map((d) => (
                <button key={d.id} type="button" className="aol-department" aria-label={d.title} title={d.title} onClick={() => onDepartment(d)}>
                  <img src={assetUrl(d.banner) ?? ''} alt="" width={150} height={30} draggable={false} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
