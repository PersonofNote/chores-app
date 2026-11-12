// App entry. Wiring only: the domain lives in src/domain and must stay DOM-free.
const app = document.querySelector<HTMLDivElement>('#app')
if (app) app.textContent = 'House Monitor: scaffold running.'
