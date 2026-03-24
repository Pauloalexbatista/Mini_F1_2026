# 🏆 REGRAS DE OURO: ARQUITETURA DA ESTRADA F1 2026

Este documento serve como a Bíblia Matemática Definitiva para a modelação e conceção de Pistas e Caixas de Boxes no Motor Gráfico e de Física Voronoi.

---

## 1. PISTA PRINCIPAL (Corredor de Corrida)

A Pista Principal é o coração estrutural. O Centro da Pista espalha-se simetricamente.
**Largura Total do Asfalto:** `250 Px`
**Largura Mínima Absoluta de Sobrevivência do Corredor (Muro-a-Muro):** `310 Px`

| Nível | Tipo de Piso | Cores (Tinta) | Penalidade Física | Regra de Existência | Espessura (Px) | Raio Acumulado (Margem) |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| **5** | **Muro** | Preto Sólido | **100%** *(Colisão/Dano)* | **Tem que existir sempre** (Barreira Inquebrável) | **5 Px** | Dinâmico *(máx 425 Px)* |
| **4** | **Relva / Gravilha** | Verde Escuro | **Top Speed 60%** | Variável. **Só se houver espaço livre.** | **Variável** | De 215 Px até 425 Px |
| **3** | **Berma 3 (Perigo)** | Vermelho Total | **Top Speed 70%** | Só a **100 Px** das curvas fortes. *(Se houver espaço)* | **30 Px** | De 185 Px até 215 Px |
| **2** | **Berma 2 (Aviso)** | Amarelo Total | **Top Speed 80%** | Só a **500 Px** das curvas fortes. *(Se houver espaço)* | **30 Px** | De 155 Px até 185 Px |
| **1** | **Berma 1 (Standard)** | Branco Total | **Top Speed 90%** | **Tem que existir sempre** (Borda contínua). | **30 Px** | De 125 Px até 155 Px |
| **0** | **Estrada (Asfalto)** | Cinza Escuro | **Top Speed 100%** | **Tem que existir sempre.** | **125 Px** | 0 Px a 125 Px |

*Nota: As Bermas 1, 2 e 3 desenham-se de fora para dentro formando camadas em "Piso". Por isso, a zona crítica visual de uma curva tem* **90 Px visíveis** *(30px+30px+30px) de borracha punitiva cumulativa adicionada face ao Asfalto normal. Mas em pistas de configuração "Street Circuit" extremamente apertadas com colisões geradas via Voronoi, as Bermas 3, 2 e a Relva são obliteradas pelos edifícios, comprimindo a Pista obrigatoriamente para a sua Raiz Mínima Estrutural de Sobrevivência:* **Muro -> Berma Branca -> Estrada -> Berma Branca -> Muro.**

---

## 2. PIT LANE (Caixa de Boxes)

A Pit Lane obedece a uma compressão extrema (-25% da escala da pista) para poupar hardware e forçar limitações de velocidade imersivas. 
**A Relva é abolida e não existem zebras de aviso largas.**

**Largura Total do Corredor Box (Muro-a-Muro):** `234 Px`

| Nível | Tipo de Piso | Cores (Tinta) | Regulamentação da Box | Espessura (Px) | Raio (Centro à Borda) |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **P-1** | **Muro da Box** | Preto Sólido | **100%** *(Colisão Imediata)* | **5 Px** | De 94 Px a 99 Px |
| **P-0** | **Asfalto Box** | Cinza Escuro / Sectores Coloridos | **Limitador: Máx 40% Speed** | **94 Px** | 0 Px a 94 Px |

*Nota: A Estrada da Pit Lane na zona restrita (1000px após a entrada) apresenta pintura no próprio asfalto para assinalar a zona de pit-stops (20% Branca -> 20% Amarela -> 20% Vermelha -> 20% Amarela -> 20% Branca).*

---

## 3. O EDITOR DE PISTAS (Studio)

Para garantir que o Criador de Pistas respeita a Sobrevivência Mínima Absoluta:
- A linha de tinta do pincel principal tem `325 Px` de envergadura no mundo Físico.
- O limitador de colisão do editor impede que dois centros de nós circulem abaixo de `330 Px` de distância.
- Se no Editor de Pistas as tintas brancas apenas se "roçarem", a física tem 100% de margem para calcular o túnel matemático de segurança, gerando muros e barreiras infalíveis!

---

## 4. TELEMETRIA E MATEMÁTICA FÍSICA

O simulador suporta Físicas avançadas que regulam as corridas de forma estanque:

- **Limite de Sobrevivência (Motor & Pneus):** Nenhum destes componentes atinge os fatais 0%. O dano estrutural tem teto máximo de 90%, resultando num mínimo físico absoluto de **10% de Componentes Intactos**. Esta folga tática evita fatalidades instantâneas e convida o piloto a regressar heroicamente (embora arrastando-se) à Pit Lane.
- **Túnel Geométrico Invisível (Voronoi):** O limite absoluto de colisão obedece estritamente a um raio imutável de **1.70w (425Px)** na Pista Principal e **0.495w (92.8Px)** na Pit Lane. O motor de renderização gráfico e o colisor de física partilham o exato mesmo limite matemático, extinguindo ilusões óticas, saídas de pista por baixo do mapa ou barreiras fantasma invisíveis em qualquer circuito (novo ou gerado em frameworks passados).
- **Leitura Algorítmica da Pista (Telemetria):** A inicialização térmica de cada pista extrai os dados absolutos via geometria Euclidiana:
   - **Extensão:** Distância exata da soma dos pontos convertida numa escala KM aproximada.
   - **Curvas/Retas:** Deteção de deltas radiantes (mudanças de trajetória > 0.02 radianos contam como curva).
   - **Velocidade Dinâmica:** Simulação virtual ao longo da reta mais longa (com penalidade de atrito do ar deduzida) prevê o Speed Trap do circuito e o Apex sugere o travão crítico das curvas apertadas.

---

## 5. REALISMO CINEMÁTICO E GRÁFICO (BROADCAST RULES)

Para imitar as transmissões autênticas da Fórmula 1 em escala Mini, o asfalto não contém demarcações rodoviárias civis (traços tracejados centrais abolidos) e o Diretor de Câmara obedece a duas fases orbitais puras:

1. **A Queda da Partida:** Durante o `Start Sequence`, a câmara paira nas nuvens para revelar o ambiente (`Scale: 0.08`). No exato momento do **2º Beep Vermelho**, a câmara mergulha implacavelmente e trava nos escapes dos carros, encurtando o tempo visual do arranco!
2. **A Despedida do Pódio:** Quando qualquer bólide cruza o axadrezado, o modo Zoom dinâmico é desativado. A câmara regressa aos céus durante fantásticos **10 Segundos**, proporcionando uma visão aérea relaxante do término, até o Motor transitar a fase da Corrida para Finalizada.

---

## 5. AFINAÇÕES AERODINÂMICAS DINÂMICAS (SLIDER FIA)

O sistema "Parc Fermé" pre-race apresenta agora um Slider contínuo de Velocidade Máxima (de 160 Km/h a 360 Km/h). O motor matemático ajusta automaticamente todos os fatores físicos do carro:

- **Eixo Mónaco (160 Km/h):** Aderência (Grip) Lateral extrema `+60%`. Arrasto Aerodinâmico maciço `Múltiplo 1.50x`.
- **Eixo Monza (360 Km/h):** Aderência Base `Nível 1.0x`. Arrasto aerodinâmico reduzido `Múltiplo 0.80x`.

### A Equação do "Steering vs Velocidade" (Understeer)
Para além da aderência genérica, a escolha da aerodinâmica afeta fatalmente o **raio de brecagem** em movimento rápido:
- `Raio de Viragem = 40 + (Velocidade x SpeedFactor)`
- Onde `SpeedFactor = 1.8 / Grip`
*Resultado Prático:* Numa curva em que dois carros viajem **ambos exatos a 150km/h**, o carro afinado para "Mónaco" consegue fletir com o dobro do aperto angular do carro afinado para "Monza". O carro Monza com "asas cortadas" sofre enorme *Understeer* forçando o piloto a soltar o acelerador muito antes!

### A Arte da Travagem (Trail-Braking)
- A potência dos travões foi calibrada rigorosamente para o **Fator 400** (face ao poder máximo de aceleração de ~500 nos Bots). Isto obriga o carro a desacelerar por metros consideráveis (destruindo as antigas paragens instantâneas arcada).
- Bloquear as quatro rodas (carregar no travão durante curvas fechadas) **multiplica violentamente o gasto dos pneus**, ditando entradas de pista cautelosas "brake-to-turn".

---

## 6. PIRÂMIDE DE DESGASTE DE PNEUS (TIRE BLISTERING)

A integridade estrutural do pneu nunca faz o carro explodir, mas obriga o piloto a recolher à Box para realizar um Pit Stop (1000px nas linhas amarelas = Pneu a 100%).

Quando o pneu entra num estado "Careca" (Abaixo de 40%):
- **Grip Mecânico Cai Brutalmente:** Até um limite absoluto de **30% da tração original**, obrigando o piloto a guiar o carro sob "gelo" para a Pit Lane.

A velocidade de Degradação Térmica obedece a uma métrica rigorosa:

| Ação de Condução | Custo Térmico (Atrito) | Marcas na Pista (Skid) | Impacto Teórico |
| :--- | :---: | :---: | :--- |
| **I: Correr Normal (Reta)** | `Nível 1` (Mínimo) | Ausentes | Gasto de quilometragem limpa. Resfria borracha. |
| **II: Excursão na Relva** | `Nível 2` (Lento) | Ausentes | Suja o pneu, criando atrito termal indesejado. |
| **III: Curvas (Scrubbing)** | `Nível 3` (Acelerado) | **Visíveis** (Se extremo) | Força-G lateral destrói tela do pneu para garantir rotação. Setup "Mónaco" gasta brutalmente mais aqui! |
| **IV: Travagem a Fundo** | `Nível 4` (Crítico) | **Visíveis** (Sempre) | Bloquear e arrastar as rodas no asfalto (Flat-Spotting) rasga os pneus instantaneamente. |

*(Aprovado e cravado a Ouro no código-fonte da Engine, 2026).*


---

## 7. OCLUSÃO VISUAL Z-INDEX E PONTES F1 (Suzuka Mode)

O Motor suporta a construção livre de **Viadutos 3D** sem sacrificar o Render a 60FPS:

1. **Topologia Z-Index:** Quando o construtor sobrepõe fitas com enorme Distância Cronológica, mas zero Distância Física, o Motor ativa Flag Nodes. A reta superior ganha a label isBridge e a reta cruzeta inferior isTunnel.
2. **Câmaras Transparentes:** No pipeline Z-Sorting (Game.tsx), desenham-se 4 camadas distintas em ordem absoluta:
   * Chão Base com Sombras Projetadas Gaussianas.
   * Carros Subjacentes (Nível 0 - encobertos fisicamente quando estão sob túnel).
   * Rampa Asfáltica da Ponte e Lancis em Elevação Gráfica Z-Index.
   * Carros do Viaduto (Nível 1 - expostos perfeitamente na câmara aérea).

---

## 8. FOTOREALISMO DE RUA (Voronoi Wall Squeezing)

**Circuitos Urbanos e Faixas Paralelas:**
Para impedir o excesso de Erva Morta nos circuitos super fechados, o Algoritmo O(N^2) Voronoi analisa os raios de proximidade dos eixos. Quando duas vias estão tangentes (sem cruzamento), ocorre o Squeeze:

* O Motor engole a margem de Relva de 425 Px para ambas as faixas.
* As pistas fundem-se a meio caminho exato, partilhando visualmente a mesma divisória num Muro Único de Betão Contínuo (Mónaco Style).
* Um **Filtro Dinâmico Smooth (Passa-Baixo)** corrige nativamente as diagonais da topologia em zigue-zague, atirando Muros lisos imperturbáveis para a grelha final de jogo.

---

### APÊNDICE: EQUAÇÕES FÍSICAS REAIS (v2026)

**O(N²) Engine de Viadutos:**
Descobre Pontes cruzando eixos onde a physicalD < 100 píxeis e a pathDist > 1000 (ou seja, nós distantes na cronologia do desenho, mas geometricamente por cima uns dos outros). Os 30 nós limítrofes recebem flag isBridge (Pista de Topo) ou isTunnel (Pista de Fundo).

**O(N) Filtro Smooth do Muro Voronoi:**
Nas aproximações em pistas de Rua, o Muro Matemático (maxWallRadius) é encolhido estritamente para Math.max(w * 0.65, minOtherSpace / 2) (Limite absoluto: margem da Berma Branca). De forma a erradicar o efeito de \'Ondulação de Pixels\' (Scalloping), todos os muros passam num filtro Passa-Baixo (Gaussian Moving Average) através dos últimos 5 nós (SMOOTH_WINDOW = 5). Pistas em *Suzuka Mode* (Túneis/Pontes) mantêm obrigatoriamente a Cota de Proteção máxima de 1.70w.

**O(N) Projeção Vectorial Física de Muros Contínuos (Anti-Dentes em Ganchos):**
Em curvas de extrema proximidade geométrica (ex: Ganchos do COTA), calcular as colisões físicas medindo estritamente a distância para o centro de cada nó gera um erro topológico: a fronteira forma "dentes afiados" poligonais invisíveis bem dentro da pista, cortando caminho face à relva que é desenhada circularmente.
A física v2026 resolve isto garantindo o limite via **Segmento de Reta Contínuo** e Interpolação Linear Normal de Vectores. Dado segmento matemático de `p1` a `p2`, o carro procura a projeção limpa `t`:
```math
L² = Distância(p1, p2)²
t = Clamp01([ (Carro.x - p1.x) * (p2.x - p1.x) + (Carro.y - p1.y) * (p2.y - p1.y) ] / L²)
VectorAlvo = p1 + t * (p2 - p1)
```
Com o `VectorAlvo` exato calculado, o recuo elástico mecânico do carro na Parede Invisível deixa de obedecer a uma manta de polígonos e torna-se um arco curvo *100% liso*, garantindo sobrevivência nos apexes mais assassinos.