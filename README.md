# GameHub

Biblioteca pessoal local para importar, organizar e executar jogos HTML5 no navegador.

## Requisitos
- Node.js 20.19+ (ou versão compatível com Vite 6)
- npm

## Instalação
```bash
npm install
npm run dev
```
Abre o endereço local apresentado pelo Vite (normalmente http://localhost:5173).

## Produção
```bash
npm run build
npm run preview
```

## Importar jogos
- **ZIP:** seleciona um ZIP com o jogo. O arquivo HTML de entrada deve estar na raiz ou numa subpasta. Os caminhos relativos dos recursos são resolvidos para Blob URLs.
- **HTML:** podes importar um HTML individual. Recursos externos continuam a depender da disponibilidade do servidor.
- **GitHub:** importa repositórios públicos com ficheiros HTML através do ZIP da branch principal.
- **URL:** importa um HTML ou ZIP remoto, se o servidor permitir CORS.

## Persistência
Os metadados e os ficheiros dos jogos ficam em IndexedDB no navegador e dispositivo atuais. Limpar os dados do site/aplicação pode apagar a biblioteca. Não existe sincronização entre dispositivos nesta versão.

## Segurança e limitações
- Os jogos correm num iframe com sandbox, separado da interface principal.
- O iframe permite scripts, pointer lock, formulários, modais e downloads; não recebe `allow-same-origin`.
- A CSP limita origens e tipos de conteúdo, mas não é uma caixa de areia perfeita. Importa apenas jogos de fontes em que confias.
- O projeto suporta jogos web HTML5. Não executa ficheiros `.exe`, jogos nativos ou jogos que dependam de servidores/build steps.
- Alguns projetos usam módulos, `fetch`, assets, service workers ou bibliotecas com requisitos especiais; poderão precisar de adaptação para funcionar dentro do iframe.
- A importação de URL/GitHub depende de ligação à Internet e permissões CORS/API.
- O modo de ecrã inteiro pode exigir interação direta do utilizador e depende do suporte do navegador.

## Próximos passos possíveis
- Importação robusta de diretórios via File System Access API.
- Melhor resolução de caminhos e módulos ES em jogos ZIP.
- Integração Supabase para sincronização e contas.
- Exportar/importar backup da biblioteca.

## Android
A interface está adaptada a ecrãs táteis e o projeto inclui manifest + service worker para instalação como PWA.

1. Publica/serve o projeto por HTTPS (ou abre-o em `localhost` no próprio Android).
2. Abre o endereço no Chrome para Android.
3. Usa **Instalar app** quando o botão aparecer, ou o menu ⋮ do Chrome → **Instalar app / Adicionar ao ecrã inicial**.
4. A biblioteca fica guardada no IndexedDB desse navegador/dispositivo. A instalação noutro telemóvel não transfere os jogos automaticamente.

Para testar na rede local a partir do computador, executa `npm run dev -- --host 0.0.0.0` e abre no Android o endereço LAN indicado. O site funciona nesse endereço, mas a instalação PWA pelo Chrome pode não estar disponível em HTTP numa rede local; para instalar, usa HTTPS.

**Importação no Android:** recomenda-se selecionar um ZIP do jogo através do seletor de ficheiros do Android. A seleção de pastas depende do suporte do navegador/fornecedor de ficheiros. O modo ecrã inteiro também depende das permissões do Chrome e do jogo embutido.
