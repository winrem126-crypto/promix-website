// Links and native <details> remain usable when JavaScript is unavailable.
document.querySelectorAll<HTMLDetailsElement>('[data-language-switcher]').forEach((control) => {
  const trigger = control.querySelector<HTMLElement>('[data-language-trigger]');
  const choices = [...control.querySelectorAll<HTMLAnchorElement>('[data-language-option]')];
  if (!trigger || !choices.length) return;
  trigger.setAttribute('aria-expanded', String(control.open));

  const close = (restoreFocus = false) => {
    control.open = false;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const open = (choice?: HTMLAnchorElement) => {
    control.open = true;
    trigger.setAttribute('aria-expanded', 'true');
    choice?.focus();
  };
  const preserveLocation = (choice: HTMLAnchorElement) => {
    const target = new URL(choice.href, location.href);
    target.search = location.search;
    target.hash = location.hash;
    choice.href = target.pathname + target.search + target.hash;
  };

  choices.forEach((choice) => {
    preserveLocation(choice);
    choice.addEventListener('pointerdown', () => preserveLocation(choice));
    choice.addEventListener('focus', () => preserveLocation(choice));
    choice.addEventListener('click', () => preserveLocation(choice));
  });
  control.addEventListener('toggle', () => {
    trigger.setAttribute('aria-expanded', String(control.open));
    if (!control.open) return;
    document.querySelectorAll<HTMLDetailsElement>('[data-language-switcher]').forEach((other) => {
      if (other !== control) other.open = false;
    });
  });
  control.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && control.open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const index = choices.indexOf(document.activeElement as HTMLAnchorElement);
    if (document.activeElement === trigger) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open(event.key === 'ArrowDown' ? choices[0] : choices[choices.length - 1]);
      }
      return;
    }
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowDown') next = (index + 1) % choices.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + choices.length) % choices.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = choices.length - 1;
    else return;
    event.preventDefault();
    choices[next].focus();
  });
  document.addEventListener('click', (event) => {
    if (!control.contains(event.target as Node)) close();
  });
  document.addEventListener('focusin', (event) => {
    if (!control.contains(event.target as Node)) close();
  });
});

export {};
