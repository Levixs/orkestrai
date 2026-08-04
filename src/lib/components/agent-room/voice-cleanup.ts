/**
 * Limpeza da saida de terminal para fala (TTS):
 * 1) remove TODAS as sequencias ANSI/escape e caracteres de controle
 *    (inclusive OSC com terminador ST — hyperlinks — e o charset de desenho
 *    DEC, que vazava como letras "0"/"q");
 * 2) normaliza o texto para fala natural: links viram "link", sem markdown,
 *    sem marcadores de lista, sem emoji/simbolos;
 * 3) descarta linhas de chrome do TUI (status bar, spinners, molduras);
 * 4) fica so com o bloco final de texto — a ultima resposta do agente,
 *    nao a tela inteira nem os logs de ferramentas.
 */

export const TUI_CHROME = /esc to interrupt|tokens?|context|cost|⠋|⠙|⠚|⠞|⠖|⠦|⠴|⠲|⠳|⠓|⡿|⣿|⣾|⣽|⣻|⢿|─|━|│|┃|┄|┆|┈|┊|┌|┐|└|┘|├|┤|┬|┴|┼|▀|▄|█|░|▒|▓|╭|╮|╯|╰/i;

/** Normaliza uma linha para ser falada (sem markdown/URL/emoji/simbolos). */
export function normalizeSpeechLine(line: string): string {
  return line
    .replace(/https?:\/\/\S+|www\.\S+/g, 'link')
    .replace(/[│┃|]/g, ' ')
    .replace(/[*_`~#]/g, ' ')
    .replace(/^\s*(?:[-+•▪◦]|\d+[.)])\s+/, '')
    // sobra so letras/numeros e pontuacao basica — emoji e simbolos saem
    .replace(/[^\p{L}\p{N}\p{M}\s.,;:!?()'"%\/+=$&@<>-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanSpeechText(raw: string): string {
  const noAnsi = raw
    // OSC (titulo, hyperlinks) com terminador BEL ou ST
    .replace(/[\u001b\u009d][^\u0007\u001b]*(?:\u0007|[\u001b\u009b]\\)/g, '')
    // CSI/DCS e afins (padrao classico ansi-regex) + escapes soltos
    .replace(/[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '')
    // controles C0/C1 restantes (menos \n) e DEL — aqui moram os "zeros" invisiveis
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .replace(/\r/g, '\n');
  const isText = (line: string) => {
    // Linha "falavel": tem letras E pelo menos uma vogal — filtra fragmentos de
    // desenho DEC ("0000qqq", molduras) que sobram como texto depois da limpeza.
    const letters = line.match(/[a-zA-ZÀ-ÿ]/g)?.length ?? 0;
    const vowels = line.match(/[aeiouAEIOUà-úÀ-Ú]/g)?.length ?? 0;
    return letters >= 2 && vowels >= 1 && !TUI_CHROME.test(line);
  };
  // Linhas que viram vazias (separadores/molduras) sao mantidas: funcionam
  // como FRONTEIRA do bloco final de texto na varredura abaixo.
  const lines = noAnsi.split('\n').map((line) => normalizeSpeechLine(line));
  // Caminha de tras pra frente juntando o bloco final de linhas de texto.
  const block: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!isText(line)) {
      if (block.length > 0) break; // fim do bloco: parou no chrome/vazio
      continue; // chrome no rabo final (status bar) — pula
    }
    if (block[0] !== line) block.unshift(line); // colapsa repeticao de redraw
  }
  return block.join(' ').replace(/\s{2,}/g, ' ').trim().slice(0, 700);
}
