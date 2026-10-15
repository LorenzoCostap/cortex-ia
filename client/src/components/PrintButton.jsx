import { Icon } from './ui.jsx';

/** Abre a impressão do navegador em A4 deitado — lá dá para escolher "Salvar como PDF". */
export default function PrintButton({ label = 'Exportar PDF', landscape = true }) {
  const print = () => {
    const style = document.createElement('style');
    style.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }`;
    document.head.appendChild(style);
    const prevTitle = document.title;
    const h1 = document.querySelector('.page-title')?.textContent;
    document.title = `Cortex - ${h1 || 'painel'} - ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}`; // vira o nome do arquivo PDF
    const done = () => { style.remove(); document.title = prevTitle; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  };
  return <button className="btn" onClick={print} title="Abre a impressão — escolha “Salvar como PDF” como impressora"><Icon name="printer" size={16} color="var(--muted)" />{label}</button>;
}
