# ðŸ† REGRAS DE OURO: ARQUITETURA DA ESTRADA F1 2026

Este documento serve como a BÃ­blia MatemÃ¡tica Definitiva para a modelaÃ§Ã£o e conceÃ§Ã£o de Pistas e Caixas de Boxes no Motor GrÃ¡fico e de FÃ­sica Voronoi.

---

## 1. PISTA PRINCIPAL (Corredor de Corrida)

A Pista Principal Ã© o coraÃ§Ã£o estrutural. O Centro da Pista espalha-se simetricamente.
**Largura Total do Asfalto:** `250 Px`
**Largura MÃ­nima Absoluta de SobrevivÃªncia do Corredor (Muro-a-Muro):** `310 Px`

| NÃ­vel | Tipo de Piso | Cores (Tinta) | Penalidade FÃ­sica | Regra de ExistÃªncia | Espessura (Px) | Raio Acumulado (Margem) |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| **5** | **Muro** | Preto SÃ³lido | **100%** *(ColisÃ£o/Dano)* | **Tem que existir sempre** (Barreira InquebrÃ¡vel) | **5 Px** | DinÃ¢mico *(mÃ¡x 425 Px)* |
| **4** | **Relva / Gravilha** | Verde Escuro | **Top Speed 60%** | VariÃ¡vel. **SÃ³ se houver espaÃ§o livre.** | **VariÃ¡vel** | De 215 Px atÃ© 425 Px |
| **3** | **Berma 3 (Perigo)** | Vermelho Total | **Top Speed 70%** | SÃ³ a **100 Px** das curvas fortes. *(Se houver espaÃ§o)* | **30 Px** | De 185 Px atÃ© 215 Px |
| **2** | **Berma 2 (Aviso)** | Amarelo Total | **Top Speed 80%** | SÃ³ a **500 Px** das curvas fortes. *(Se houver espaÃ§o)* | **30 Px** | De 155 Px atÃ© 185 Px |
| **1** | **Berma 1 (Standard)** | Branco Total | **Top Speed 90%** | **Tem que existir sempre** (Borda contÃ­nua). | **30 Px** | De 125 Px atÃ© 155 Px |
| **0** | **Estrada (Asfalto)** | Cinza Escuro | **Top Speed 100%** | **Tem que existir sempre.** | **125 Px** | 0 Px a 125 Px |

*Nota: As Bermas 1, 2 e 3 desenham-se de fora para dentro formando camadas em "Piso". Por isso, a zona crÃ­tica visual de uma curva tem* **90 Px visÃ­veis** *(30px+30px+30px) de borracha punitiva cumulativa adicionada face ao Asfalto normal. Mas em pistas de configuraÃ§Ã£o "Street Circuit" extremamente apertadas com colisÃµes geradas via Voronoi, as Bermas 3, 2 e a Relva sÃ£o obliteradas pelos edifÃ­cios, comprimindo a Pista obrigatoriamente para a sua Raiz MÃ­nima Estrutural de SobrevivÃªncia:* **Muro -> Berma Branca -> Estrada -> Berma Branca -> Muro.**

---

## 2. PIT LANE (Caixa de Boxes)

A Pit Lane obedece a uma compressÃ£o extrema (-25% da escala da pista) para poupar hardware e forÃ§ar limitaÃ§Ãµes de velocidade imersivas. 
**A Relva Ã© abolida e nÃ£o existem zebras de aviso largas.**

**Largura Total do Corredor Box (Muro-a-Muro):** `234 Px`

| NÃ­vel | Tipo de Piso | Cores (Tinta) | RegulamentaÃ§Ã£o da Box | Espessura (Px) | Raio (Centro Ã  Borda) |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **P-1** | **Muro da Box** | Preto SÃ³lido | **100%** *(ColisÃ£o Imediata)* | **5 Px** | De 94 Px a 99 Px |
| **P-0** | **Asfalto Box** | Cinza Escuro / Sectores Coloridos | **Limitador: MÃ¡x 40% Speed** | **94 Px** | 0 Px a 94 Px |

*Nota: A Estrada da Pit Lane na zona restrita (1000px apÃ³s a entrada) apresenta pintura no prÃ³prio asfalto para assinalar a zona de pit-stops (20% Branca -> 20% Amarela -> 20% Vermelha -> 20% Amarela -> 20% Branca).*

---

## 3. O EDITOR DE PISTAS (Studio)

Para garantir que o Criador de Pistas respeita a SobrevivÃªncia MÃ­nima Absoluta:
- A linha de tinta do pincel principal tem `325 Px` de envergadura no mundo FÃ­sico.
- O limitador de colisÃ£o do editor impede que dois centros de nÃ³s circulem abaixo de `330 Px` de distÃ¢ncia.
- Se no Editor de Pistas as tintas brancas apenas se "roÃ§arem", a fÃ­sica tem 100% de margem para calcular o tÃºnel matemÃ¡tico de seguranÃ§a, gerando muros e barreiras infalÃ­veis!

---

## 4. TELEMETRIA E MATEMÃTICA FÃSICA

O simulador suporta FÃ­sicas avanÃ§adas que regulam as corridas de forma estanque:

- **Limite de SobrevivÃªncia (Motor & Pneus):** Nenhum destes componentes atinge os fatais 0%. O dano estrutural tem teto mÃ¡ximo de 90%, resultando num mÃ­nimo fÃ­sico absoluto de **10% de Componentes Intactos**. Esta folga tÃ¡tica evita fatalidades instantÃ¢neas e convida o piloto a regressar heroicamente (embora arrastando-se) Ã  Pit Lane.
- **TÃºnel GeomÃ©trico InvisÃ­vel (Voronoi):** O limite absoluto de colisÃ£o obedece estritamente a um raio imutÃ¡vel de **1.70w (425Px)** na Pista Principal e **0.495w (92.8Px)** na Pit Lane. O motor de renderizaÃ§Ã£o grÃ¡fico e o colisor de fÃ­sica partilham o exato mesmo limite matemÃ¡tico, extinguindo ilusÃµes Ã³ticas, saÃ­das de pista por baixo do mapa ou barreiras fantasma invisÃ­veis em qualquer circuito (novo ou gerado em frameworks passados).
- **Leitura AlgorÃ­tmica da Pista (Telemetria):** A inicializaÃ§Ã£o tÃ©rmica de cada pista extrai os dados absolutos via geometria Euclidiana:
   - **ExtensÃ£o:** DistÃ¢ncia exata da soma dos pontos convertida numa escala KM aproximada.
   - **Curvas/Retas:** DeteÃ§Ã£o de deltas radiantes (mudanÃ§as de trajetÃ³ria > 0.02 radianos contam como curva).
   - **Velocidade DinÃ¢mica:** SimulaÃ§Ã£o virtual ao longo da reta mais longa (com penalidade de atrito do ar deduzida) prevÃª o Speed Trap do circuito e o Apex sugere o travÃ£o crÃ­tico das curvas apertadas.

---

## 5. REALISMO CINEMÃTICO E GRÃFICO (BROADCAST RULES)

Para imitar as transmissÃµes autÃªnticas da FÃ³rmula 1 em escala Mini, o asfalto nÃ£o contÃ©m demarcaÃ§Ãµes rodoviÃ¡rias civis (traÃ§os tracejados centrais abolidos) e o Diretor de CÃ¢mara obedece a duas fases orbitais puras:

1. **A Queda da Partida:** Durante o `Start Sequence`, a cÃ¢mara paira nas nuvens para revelar o ambiente (`Scale: 0.08`). No exato momento do **2Âº Beep Vermelho**, a cÃ¢mara mergulha implacavelmente e trava nos escapes dos carros, encurtando o tempo visual do arranco!
2. **A Despedida do PÃ³dio:** Quando qualquer bÃ³lide cruza o axadrezado, o modo Zoom dinÃ¢mico Ã© desativado. A cÃ¢mara regressa aos cÃ©us durante fantÃ¡sticos **10 Segundos**, proporcionando uma visÃ£o aÃ©rea relaxante do tÃ©rmino, atÃ© o Motor transitar a fase da Corrida para Finalizada.

---

## 5. AFINAÃ‡Ã•ES AERODINÃ‚MICAS DINÃ‚MICAS (SLIDER FIA)

O sistema "Parc FermÃ©" pre-race apresenta agora um Slider contÃ­nuo de Velocidade MÃ¡xima (de 160 Km/h a 360 Km/h). O motor matemÃ¡tico ajusta automaticamente todos os fatores fÃ­sicos do carro:

- **Eixo MÃ³naco (160 Km/h):** AderÃªncia (Grip) Lateral extrema `+60%`. Arrasto AerodinÃ¢mico maciÃ§o `MÃºltiplo 1.50x`.
- **Eixo Monza (360 Km/h):** AderÃªncia Base `NÃ­vel 1.0x`. Arrasto aerodinÃ¢mico reduzido `MÃºltiplo 0.80x`.

### A EquaÃ§Ã£o do "Steering vs Velocidade" (Understeer)
Para alÃ©m da aderÃªncia genÃ©rica, a escolha da aerodinÃ¢mica afeta fatalmente o **raio de brecagem** em movimento rÃ¡pido:
- `Raio de Viragem = 40 + (Velocidade x SpeedFactor)`
- Onde `SpeedFactor = 1.8 / Grip`
*Resultado PrÃ¡tico:* Numa curva em que dois carros viajem **ambos exatos a 150km/h**, o carro afinado para "MÃ³naco" consegue fletir com o dobro do aperto angular do carro afinado para "Monza". O carro Monza com "asas cortadas" sofre enorme *Understeer* forÃ§ando o piloto a soltar o acelerador muito antes!

### A Arte da Travagem (Trail-Braking)
- A potÃªncia dos travÃµes foi calibrada rigorosamente para o **Fator 400** (face ao poder mÃ¡ximo de aceleraÃ§Ã£o de ~500 nos Bots). Isto obriga o carro a desacelerar por metros considerÃ¡veis (destruindo as antigas paragens instantÃ¢neas arcada).
- Bloquear as quatro rodas (carregar no travÃ£o durante curvas fechadas) **multiplica violentamente o gasto dos pneus**, ditando entradas de pista cautelosas "brake-to-turn".

---

## 6. PIRÃ‚MIDE DE DESGASTE DE PNEUS (TIRE BLISTERING)

A integridade estrutural do pneu nunca faz o carro explodir, mas obriga o piloto a recolher Ã  Box para realizar um Pit Stop (1000px nas linhas amarelas = Pneu a 100%).

Quando o pneu entra num estado "Careca" (Abaixo de 40%):
- **Grip MecÃ¢nico Cai Brutalmente:** AtÃ© um limite absoluto de **30% da traÃ§Ã£o original**, obrigando o piloto a guiar o carro sob "gelo" para a Pit Lane.

A velocidade de DegradaÃ§Ã£o TÃ©rmica obedece a uma mÃ©trica rigorosa:

| AÃ§Ã£o de ConduÃ§Ã£o | Custo TÃ©rmico (Atrito) | Marcas na Pista (Skid) | Impacto TeÃ³rico |
| :--- | :---: | :---: | :--- |
| **I: Correr Normal (Reta)** | `NÃ­vel 1` (MÃ­nimo) | Ausentes | Gasto de quilometragem limpa. Resfria borracha. |
| **II: ExcursÃ£o na Relva** | `NÃ­vel 2` (Lento) | Ausentes | Suja o pneu, criando atrito termal indesejado. |
| **III: Curvas (Scrubbing)** | `NÃ­vel 3` (Acelerado) | **VisÃ­veis** (Se extremo) | ForÃ§a-G lateral destrÃ³i tela do pneu para garantir rotaÃ§Ã£o. Setup "MÃ³naco" gasta brutalmente mais aqui! |
| **IV: Travagem a Fundo** | `NÃ­vel 4` (CrÃ­tico) | **VisÃ­veis** (Sempre) | Bloquear e arrastar as rodas no asfalto (Flat-Spotting) rasga os pneus instantaneamente. |

*(Aprovado e cravado a Ouro no cÃ³digo-fonte da Engine, 2026).*


---

## 7. OCLUSÃƒO VISUAL Z-INDEX E PONTES F1 (Suzuka Mode)

O Motor suporta a construÃ§Ã£o livre de **Viadutos 3D** sem sacrificar o Render a 60FPS:

1. **Topologia Z-Index:** Quando o construtor sobrepÃµe fitas com enorme DistÃ¢ncia CronolÃ³gica, mas zero DistÃ¢ncia FÃ­sica, o Motor ativa Flag Nodes. A reta superior ganha a label isBridge e a reta cruzeta inferior isTunnel.
2. **CÃ¢maras Transparentes:** No pipeline Z-Sorting (Game.tsx), desenham-se 4 camadas distintas em ordem absoluta:
   * ChÃ£o Base com Sombras Projetadas Gaussianas.
   * Carros Subjacentes (NÃ­vel 0 - encobertos fisicamente quando estÃ£o sob tÃºnel).
   * Rampa AsfÃ¡ltica da Ponte e Lancis em ElevaÃ§Ã£o GrÃ¡fica Z-Index.
   * Carros do Viaduto (NÃ­vel 1 - expostos perfeitamente na cÃ¢mara aÃ©rea).

---

## 8. FOTOREALISMO DE RUA (Voronoi Wall Squeezing)

**Circuitos Urbanos e Faixas Paralelas:**
Para impedir o excesso de Erva Morta nos circuitos super fechados, o Algoritmo O(N^2) Voronoi analisa os raios de proximidade dos eixos. Quando duas vias estÃ£o tangentes (sem cruzamento), ocorre o Squeeze:

* O Motor engole a margem de Relva de 425 Px para ambas as faixas.
* As pistas fundem-se a meio caminho exato, partilhando visualmente a mesma divisÃ³ria num Muro Ãšnico de BetÃ£o ContÃ­nuo (MÃ³naco Style).
* Um **Filtro DinÃ¢mico Smooth (Passa-Baixo)** corrige nativamente as diagonais da topologia em zigue-zague, atirando Muros lisos imperturbÃ¡veis para a grelha final de jogo.

---

### APÃŠNDICE: EQUAÃ‡Ã•ES FÃSICAS REAIS (v2026)

**O(NÂ²) Engine de Viadutos:**
Descobre Pontes cruzando eixos onde a physicalD < 100 pÃ­xeis e a pathDist > 1000 (ou seja, nÃ³s distantes na cronologia do desenho, mas geometricamente por cima uns dos outros). Os 30 nÃ³s limÃ­trofes recebem flag isBridge (Pista de Topo) ou isTunnel (Pista de Fundo).

**O(N) Filtro Smooth do Muro Voronoi:**
Nas aproximaÃ§Ãµes em pistas de Rua, o Muro MatemÃ¡tico (maxWallRadius) Ã© encolhido estritamente para Math.max(w * 0.65, minOtherSpace / 2) (Limite absoluto: margem da Berma Branca). De forma a erradicar o efeito de \'OndulaÃ§Ã£o de Pixels\' (Scalloping), todos os muros passam num filtro Passa-Baixo (Gaussian Moving Average) atravÃ©s dos Ãºltimos 5 nÃ³s (SMOOTH_WINDOW = 5). Pistas em *Suzuka Mode* (TÃºneis/Pontes) mantÃªm obrigatoriamente a Cota de ProteÃ§Ã£o mÃ¡xima de 1.70w.

**O(N) ProjeÃ§Ã£o Vectorial FÃ­sica de Muros ContÃ­nuos (Anti-Dentes em Ganchos):**
Em curvas de extrema proximidade geomÃ©trica (ex: Ganchos do COTA), calcular as colisÃµes fÃ­sicas medindo estritamente a distÃ¢ncia para o centro de cada nÃ³ gera um erro topolÃ³gico: a fronteira forma "dentes afiados" poligonais invisÃ­veis bem dentro da pista, cortando caminho face Ã  relva que Ã© desenhada circularmente.
A fÃ­sica v2026 resolve isto garantindo o limite via **Segmento de Reta ContÃ­nuo** e InterpolaÃ§Ã£o Linear Normal de Vectores. Dado segmento matemÃ¡tico de `p1` a `p2`, o carro procura a projeÃ§Ã£o limpa `t`:
```math
LÂ² = DistÃ¢ncia(p1, p2)Â²
t = Clamp01([ (Carro.x - p1.x) * (p2.x - p1.x) + (Carro.y - p1.y) * (p2.y - p1.y) ] / LÂ²)
VectorAlvo = p1 + t * (p2 - p1)
```
Com o `VectorAlvo` exato calculado, o recuo elÃ¡stico mecÃ¢nico do carro na Parede InvisÃ­vel deixa de obedecer a uma manta de polÃ­gonos e torna-se um arco curvo *100% liso*, garantindo sobrevivÃªncia nos apexes mais assassinos.

---

## 9. INFRAESTRUTURA DE SERVIDOR E PERSISTÃŠNCIA (COOLIFY)

O backend Ã© suportado por **Node.js** e uma Base de Dados **SQLite**. Ã‰ absolutamente crÃ­tico que os futuros programadores e Agentes IA respeitem as seguintes Regras de SobrevivÃªncia na Nuvem (VPS):

1. **Containers EfÃ©meros:** O sistema de Deploy do Coolify baseia-se em Docker. Sempre que se executa um "Force Rebuild", a mÃ¡quina inteira Ã© deitada ao lixo e substituÃ­da por uma nova a partir do GitHub. Qualquer dado gravado nas diretorias normais da app (como `/app/server/database.sqlite`) desaparece para sempre.
2. **O Volume Persistente (O Cofre-Forte):** A Base de Dados em ProduÃ§Ã£o foi codificada (em `server/database.js`) para habitar Ãºnica e exclusivamente a diretoria protegida `/app/server_data`.
3. **Mapeamento ObrigatÃ³rio no Painel Cloud:** Para garantir a vida eterna das pistas construÃ­das, Ã© **ESTRITAMENTE OBRIGATÃ“RIO** no Painel do Coolify adicionar um Volume Persistente apontando estritamente para o Destination: `/app/server_data`.
4. **Isolamento Git (Gitignore):** O ficheiro `database.sqlite` fÃ­sico local (e os seus complementos `.sqlite-wal`, `.sqlite-shm`) **JAMAIS** podem ser incluÃ­dos nos commits do Git. Foram blindados no `.gitignore`. Se o Git os arrastar para produÃ§Ã£o, irÃ£o esmagar e apagar a BD online real durante o Deploy!

*(Estas regras de infraestrutura sÃ£o dogmÃ¡ticas e nÃ£o devem ser contornadas).*

---

## 10. SINCRONIZAÃ‡ÃƒO MULTIPLAYER (EVENT-DRIVEN ARCHITECTURE)

Para mitigar dessincronizaÃ§Ãµes fatais numa arquitetura WebSockets baseada em eventos, o motor multi-jogador aplica quatro mandamentos de ferro:

1. **Parc FermÃ© (Privacidade RÃ­gida):** O EcrÃ£ de setups garante "Visual Oclusion" total. Os mecÃ¢nicos do jogador X nÃ£o conseguem ver a afinaÃ§Ã£o (Asas MÃ³naco/Monza) do carro do jogador Y. As 'cards' dos adversÃ¡rios sÃ£o puramente decorativas e relatam estritamente o estado da sua rede: "A PREPARAR..." ou "PRONTO A CORRER".
2. **Handshake de Grelha (`all_setup_ready`):** Clicar em "IR PARA A PISTA" nÃ£o inicia a corrida isoladamente em corridas multijogador. A interface transita para "A AGUARDAR ADVERSÃ RIO..." e o cronÃ³metro dos mÃ­ticos 5 Segundos Vermelhos (`startSequence`) sÃ³ pode arrancar quando o servidor Node.js efetuar o *broadcast* do sinal `all_setup_ready` (garantindo que absolutamente todos os pilotos de carne e osso detetados na sala confirmaram a via).
3. **PersistÃªncia 'Frozen Grid' Post-Start:** Durante uma corrida longa, a sala (*Lobby*) pode sofrer flutuaÃ§Ãµes violentas de pacotes (e.g., um piloto cai de rede ou desiste a meio). Para evitar que esta alteraÃ§Ã£o provoque *re-renders* assÃ­ncronos no DOM do React forÃ§ando um recomeço letal da corrida para todos, o motor fÃ­sico arranca e isola numa clausura aspersa um "Array Congelado" (`racePlayers`), ignorando por completo perturbaÃ§Ãµes na sala originÃ¡ria.
4. **Campeonatos Granulares (Laps por Pista):** As configuraÃ§Ãµes de um "Evento" assumem Mapas DicionÃ¡rio. Um Campeonato longo comporta-se por alocaÃ§Ãµes customizadas, permitindo agregar na exata mesma ID de evento provas Endurances (Suzuka - 7 Voltas) juntamente a Sprints curtos (MÃ³naco - 3 Voltas).

---

# IDEIAS PARA O FUTURO: "Motorsport Mini"

Este documento guarda as nossas sessÃµes de *brainstorming* para futuras expansÃµes do **Mini F1 2026**, transformando-o num simulador multidesportivo ("Motorsport Mini").

## ðŸï¸ 1. Motociclismo (MotoGP / Superbikes)

- **Arte Pseudo-3D (Renderer)**: Em vez de desenharmos a mota estÃ¡tica vista de cima, a "inclinaÃ§Ã£o" nas curvas serÃ¡ simulada atravÃ©s de deformaÃ§Ã£o visual (*Skew* no Canvas) e deslocaÃ§Ã£o lateral do corpo do piloto.
- **FÃ­sica DielÃ©trica**: A mota deitar-se-Ã¡ conforme o Ã¢ngulo do volante e a forÃ§a G (forÃ§a lateral). O capacete e os ombros do piloto deslocam-se ligeiramente para o lado de dentro da curva no Eixo Y local.
- **Efeitos Especiais**: Quando a inclinaÃ§Ã£o exceder um limiar de agressividade, desenhamos faÃ­scas amarelas a saltar do *curb*, simulando o cotovelo e o joelho de titÃ¢nio a raspar no alcatrÃ£o.

## ðŸŽï¸ 2. Carros de Drift (JDM Style)
- **Arte Angular**: A arte baseia-se em carros icÃ³nicos modificados, exibindo rodas da frente agressivas e completamente viradas em "contra-brecagem" durante a curva.
- **FÃ­sica de Derraparem (Slip Angle)**: Os carros terÃ£o traÃ§Ã£o traseira reduzida. O motor matemÃ¡tico permitirÃ¡ uma diferenÃ§a enorme entre o Ã¢ngulo para onde o carro aponta (`car.angle`) e o Ã¢ngulo matemÃ¡tico para onde se desloca.
- **Efeitos Especiais**: Fumo de pneus volumoso e contÃ­nuo gerado matematicamente por trÃ¡s das rodas de traÃ§Ã£o sempre que o *Slip Angle* for elevado, deixando o ecrÃ£ cheio de nevoeiro opaco.

## ðŸš™ 3. Rally (WRC Style)
- **Track Builder EvoluÃ­do**: O *Track Builder Studio* precisaria de uma grande atualizaÃ§Ã£o para suportar **MÃºltiplos Tipos de Terreno** (Asfalto, Terra Batida, Neve, Gelo). Os construtores poderiam "pintar" segmentos da Spline. Cada NÃ³ (Node) teria a sua prÃ³pria propriedade de `surfaceType`.
- **FÃ­sica AWD (All-Wheel Drive)**: TraÃ§Ã£o Ã s quatro rodas! A fÃ­sica leria o terreno abaixo do carro em tempo real. Saltar de Asfalto (onde a traÃ§Ã£o Ã© imensa) para Terra Batida faria o `grip` cair a pique, obrigando o carro a varrer a curva de lado num *power slide* para nÃ£o ir contra as Ã¡rvores.
- **Efeitos Especiais**: Em vez de borracha queimada no asfalto, o rasto deixado pelo carro mudaria de cor. Terra batida atiraria nuvens de pÃ³ castanho (partÃ­culas que sobem e cobrem os carros atrÃ¡s); enquanto na Neve levantar-se-iam flocos brancos.
- **Arte do VeÃ­culo**: Carros mais "quadrados" com suspensÃµes altas. A arte 2D poderia espelhar o "Dive" (mergulho da suspensÃ£o ao travar) aumentando ou diminuindo ligeiramente a escala (Zoom) do capÃ´ e da traseira do carro consoante a aceleraÃ§Ã£o para dar ilusÃ£o de inÃ©rcia longitudinal e saltos!

## ðŸ 4. ReformulaÃ§Ã£o do Menu Principal (A Garagem do Piloto)
Para suportar esta diversidade, o separador atual de **"TEAMS" (Equipas)** desapareceria totalmente. No seu lugar, surgiria a **"GARAGEM"**:
- O jogador deixa de escolher uma equipa histÃ³rica prÃ©-feita e passa a ser o dono da sua frota pessoal.
- Na Garagem, o piloto tem quatro "Slots": **1 F1**, **1 Drift**, **1 Mota** e **1 Rally**.
- O jogador escolhe a classe de veÃ­culo que quer levar para a prÃ³xima corrida e personaliza simplesmente as duas cores primÃ¡rias e secundÃ¡rias do veÃ­culo (jÃ¡ existentes no nosso sistema atual).
- A UI mostraria os quatro veÃ­culos Lado-a-Lado no ecrÃ£ de seleÃ§Ã£o com a paleta de cores partilhada aplicada em tempo real aos quatro modelos 2D!

## ðŸŒ 5. Multiplayer Localizado (Salas Privadas & PINs)
Com o motor atual a suportar nativamente WebSockets a 60FPS, o desÃ­gnio passa por evoluir a arquitetura de "Servidor Global Ãšnico" para uma topologia de MÃºltiplos Hubs (Salas).
- **CriaÃ§Ã£o de Salas**: Na garagem, o jogador passa a ter as opÃ§Ãµes "Criar Sala" ou "Entrar com CÃ³digo".
- **CÃ³digo PIN**: O servidor transfere o conceito de `io.emit()` genÃ©rico para instÃ¢ncias de `io.to('1234').emit()`, permitindo que grupos de amigos corram em canais fÃ­sicos completamente selados, sem colisÃµes de estados ou de *starts* acidentais entre diferentes grupos que estejam hospedados no mesmo VPS Coolify em simultÃ¢neo.
- **Vantagem TÃ¡tica**: VÃ¡rias corridas em diferentes continentes e em diferentes pistas a correrem lado-a-lado usando a exata mesma infraestrutura leve em NodeJS sem qualquer sobreposiÃ§Ã£o de memÃ³ria.

