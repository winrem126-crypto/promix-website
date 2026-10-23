const preview = document.querySelector('[data-concept-preview]');
const conceptData = JSON.parse(document.querySelector('#hero-concepts-data')?.textContent || '[]');
const panels = [...document.querySelectorAll('[data-concept-panel]')];
const selectors = [...document.querySelectorAll('[data-concept-select]')];
const conceptLabel = document.querySelector('[data-concept-label]');
const conceptName = document.querySelector('[data-concept-name]');
const conceptIdea = document.querySelector('[data-concept-idea]');

const activateConcept = (nextIndex, updateUrl = true) => {
  const index = Math.max(1, Math.min(conceptData.length, Number(nextIndex) || 1));
  preview?.setAttribute('data-active-concept', String(index));
  panels.forEach((panel) => panel.setAttribute('aria-hidden', String(Number(panel.dataset.conceptPanel) !== index)));
  selectors.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.conceptSelect) === index)));

  const selected = conceptData[index - 1];
  if (conceptLabel) conceptLabel.textContent = `CONCEPT ${selected.index}`;
  if (conceptName) conceptName.textContent = selected.name;
  if (conceptIdea) conceptIdea.textContent = selected.idea;

  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('concept', String(index));
    history.replaceState(null, '', url);
  }
};

selectors.forEach((button) => button.addEventListener('click', () => activateConcept(button.dataset.conceptSelect)));
document.addEventListener('keydown', (event) => {
  if (/^[1-4]$/.test(event.key) && !document.querySelector('dialog[open]')) activateConcept(event.key);
});
activateConcept(new URLSearchParams(location.search).get('concept') || 1, false);

const menuButton = document.querySelector('.concept-menu-toggle');
const mobileMenu = document.querySelector('#concept-mobile-menu');
menuButton?.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!expanded));
  mobileMenu.hidden = expanded;
});
mobileMenu?.querySelectorAll('a, button').forEach((item) => item.addEventListener('click', () => {
  mobileMenu.hidden = true;
  menuButton?.setAttribute('aria-expanded', 'false');
}));

const consultationModal = document.querySelector('[data-consultation-modal]');
let modalOpener = null;

const closeDialog = () => consultationModal?.close();
document.querySelectorAll('[data-open-form]').forEach((button) => button.addEventListener('click', () => {
  modalOpener = button;
  consultationModal?.showModal();
}));
document.querySelector('[data-dialog-close]')?.addEventListener('click', closeDialog);
consultationModal?.addEventListener('click', (event) => {
  if (event.target === consultationModal) closeDialog();
});
consultationModal?.addEventListener('close', () => {
  const form = consultationModal.querySelector('form');
  const submit = form?.querySelector('button[type="submit"]');
  const status = form?.querySelector('.form-status');
  form?.reset();
  if (submit) submit.disabled = false;
  if (status) status.hidden = true;
  modalOpener?.focus();
  modalOpener = null;
});

document.querySelector('[data-consult-form]')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  form.querySelector('.form-status').hidden = false;
  form.querySelector('button[type="submit"]').disabled = true;
  setTimeout(closeDialog, 1800);
});
