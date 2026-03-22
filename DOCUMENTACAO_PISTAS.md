# 🏆 REGRAS DE OURO: ARQUITETURA DA ESTRADA F1 2026

Este documento serve como a Bíblia Matemática Definitiva para a modelação e conceção de Pistas e Caixas de Boxes no Motor Gráfico e de Física Voronoi.

---

## 1. PISTA PRINCIPAL (Corredor de Corrida)

A Pista Principal é o coração estrutural. O Centro da Pista espalha-se simetricamente.
**Largura Total do Asfalto:** `250 Px`
**Largura Mínima Absoluta de Sobrevivência do Corredor (Muro-a-Muro):** `310 Px`

| Nível | Tipo de Piso | Cores (Tinta) | Penalidade Física | Regra de Existência | Espessura (Px) | Raio (Centro à Borda) |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| **5** | **Muro** | Preto Sólido | **100%** *(Colisão/Dano)* | **Tem que existir sempre** (Barreira Inquebrável) | **5 Px** | Dinâmico *(máx 425 Px)* |
| **4** | **Relva / Gravilha** | Verde Escuro | **- 40%** | Variável. **Só se houver espaço livre.** | **0 a 220 Px** | De 200 Px até 425 Px |
| **3** | **Berma 3 (Perigo)** | Vermelho Total | **- 30%** | Só a **100 Px** das curvas fortes. *(Só se houver espaço)* | **25 Px** | De 175 Px até 200 Px |
| **2** | **Berma 2 (Aviso)** | Amarelo Total | **- 20%** | Só a **500 Px** das curvas fortes. *(Só se houver espaço)* | **25 Px** | De 150 Px até 175 Px |
| **1** | **Berma 1 (Standard)** | Branco Total | **- 10%** | **Tem que existir sempre** (Borda contínua). | **25 Px** | De 125 Px até 150 Px |
| **0** | **Estrada (Asfalto)** | Cinza Escuro | **0%** *(Tração ideal)* | **Tem que existir sempre.** | **125 Px** | 0 Px a 125 Px |

*Nota: As Bermas 1, 2 e 3 desenham-se de fora para dentro formando camadas em "Piso". Por isso, a zona crítica visual de uma curva tem* **75 Px visíveis** *(25px+25px+25px) de borracha punitiva cumulativa acumulada face ao Asfalto normal. Mas em pistas apertadas com colisões, as Bermas 3 e 2 e a Relva evaporam, comprimindo a Pista obrigatoriamente para a sua Raiz Mínima Estrutural de `155 Px` (Asfalto + Berma 1 + Muro).*

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

## 5. AFINAÇÕES AERODINÂMICAS (FIA SETUPS)

O sistema "Parc Fermé" pre-race obriga o utilizador a definir o balanço de forças lateral vs frontal. A afinação selecionada rege a aceleração global de **ambos** o Jogador e a malha de Bots da Inteligência Artificial:

1. **Monza Specs (Low Downforce):** `360 Km/h` Velocidade Máxima | *Grip Base* (1.0x) | Arrasto: 0.8x
2. **Balanço F1 (Medium Downforce):** `260 Km/h` Velocidade Máxima | *Grip +25%* (1.25x) | Arrasto: 1.0x
3. **Mónaco Specs (High Downforce):** `160 Km/h` Velocidade Máxima | *Grip +60%* (1.60x) | Arrasto: 1.5x

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
