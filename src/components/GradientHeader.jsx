export default function GradientHeader({ title, subtitle, rightSlot }) {
  return (
    <header className="hero-header ui-hero">
      <div className="hero-header__orb hero-header__orb--right" aria-hidden="true" />
      <div className="hero-header__orb hero-header__orb--left" aria-hidden="true" />
      <div className="hero-header__content">
        <div>
          <span className="hero-header__line" />
          <p className="hero-header__kicker">
            Campus Hub
          </p>
          <h1 className="hero-header__title">{title}</h1>
          {subtitle ? (
            <p className="hero-header__subtitle">{subtitle}</p>
          ) : null}
        </div>
        {rightSlot ? <div className="hero-header__slot">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
