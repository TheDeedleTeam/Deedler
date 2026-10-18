# 🔥 Deedler

**O navegador oficial da deeddle.** Um navegador leve, rápido e cheio de personalidade, feito com Electron: abas, favoritos, bloqueador de anúncios, paleta de comandos e muito mais, tudo com visual escuro e destaque laranja.

---

## ✨ Funcionalidades

### Navegação
- **Abas completas**: fixar, silenciar, duplicar, reordenar arrastando e reabrir a última fechada.
- **Restauração de sessão**: ao abrir, o Deedler volta com as abas de onde você parou.
- **Barra de endereço inteligente**: sugestões de abas, favoritos e histórico, além de uma calculadora embutida (digite `15% * 240`).
- **Atalhos de busca**: `yt lofi`, `gh kristal`, `mdn fetch`, `npm electron`, `so promise` e `tr hello`.
- **Escolha seu mecanismo de busca**: Google, DuckDuckGo, Bing ou Brave Search.
- **Página inicial própria** com relógio, saudação e atalhos rápidos para seus sites favoritos.

### Ferramentas
- ⭐ **Favoritos** com barra dedicada e painel de gerenciamento.
- 🕘 **Histórico** com busca e agrupamento por dia.
- 📥 **Downloads** com progresso, "Abrir" e "Mostrar na pasta".
- 🔎 **Buscar na página** (Ctrl+F).
- 🔍 **Zoom por site**, lembrado entre as visitas.
- 🌙 **Modo escuro forçado** para qualquer site.
- 📸 **Captura de tela** da página, copiada para a área de transferência e salva em Downloads.
- ⌨️ **Paleta de comandos** (Ctrl+Shift+P) para acessar qualquer função.
- 🛠️ **Ferramentas do desenvolvedor** com F12.

### Privacidade e segurança
- 🛡️ **Bloqueador de anúncios e rastreadores** (pode ser desligado nas configurações).
- 🔗 **Copiar link limpo**, sem `utm_*`, `fbclid`, `gclid` e similares.
- 🔐 **Permissões sob confirmação**: câmera, microfone, localização e notificações só são liberados se você permitir.
- Executáveis baixados **nunca são abertos direto** pelo app.
- Nada é enviado a serviços de terceiros: ícones da página inicial e dos favoritos são gerados localmente.

### Personalização
- Cor de destaque configurável.
- Barra de favoritos opcional.
- Restauração de abas opcional.

---

## ⌨️ Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+T` / `Ctrl+W` | Nova aba / fechar aba |
| `Ctrl+Shift+T` | Reabrir aba fechada |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Próxima / aba anterior |
| `Ctrl+1…9` | Ir para a aba N (9 = última) |
| `Ctrl+L` | Focar na barra de endereço |
| `Ctrl+R` / `F5` | Recarregar |
| `Ctrl+Shift+R` / `Ctrl+F5` | Recarregar ignorando o cache |
| `Alt+←` / `Alt+→` | Voltar / avançar |
| `Alt+Home` | Página inicial |
| `Ctrl+D` | Favoritar a página |
| `Ctrl+F` | Buscar na página |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Zoom |
| `Ctrl+H` / `Ctrl+J` / `Ctrl+B` | Histórico / downloads / favoritos |
| `Ctrl+Shift+P` | Paleta de comandos |
| `Ctrl+Shift+D` | Modo escuro forçado |
| `Ctrl+Shift+S` | Capturar tela da página |
| `F11` | Tela cheia |
| `F12` / `Ctrl+Shift+I` | Ferramentas do desenvolvedor |
| `Esc` | Fechar painel, busca ou paleta |

---

## 🚀 Como rodar

Requisitos: [Node.js](https://nodejs.org/) instalado.

```bash
# instalar as dependências
npm install

# abrir o Deedler em modo desenvolvimento
npm start
```

## 📦 Como gerar o instalador

```bash
npm run dist
```

Os arquivos aparecem na pasta `dist/`:

- **Windows**: instalador `.exe` (NSIS) e versão portable
- **Linux**: `.AppImage` e `.deb`
- **macOS**: `.dmg`

> Gere o instalador no mesmo sistema operacional em que ele vai rodar.
> No Windows, como o app não é assinado, o SmartScreen pode mostrar um aviso: clique em **Mais informações → Executar assim mesmo**.

---

## 🗂️ Estrutura do projeto

```
Deedler/
├── main.js        # processo principal: janela, atalhos, adblock, permissões, downloads
├── preload.js     # ponte segura entre o app e a interface
├── renderer.js    # interface: abas, painéis, favoritos, paleta, etc.
├── index.html     # layout e estilos
├── assets/        # ícones e fonte (Coolvetica)
└── package.json
```

## 🧰 Tecnologias

- [Electron](https://www.electronjs.org/)
- JavaScript puro (sem frameworks)
- [electron-builder](https://www.electron.build/) para empacotamento

---

## 🤫 Easter egg

Existe um código secreto escondido na interface. Dica: é um clássico dos videogames dos anos 80.

---

Feito com 🧡 pela **deedle**.
