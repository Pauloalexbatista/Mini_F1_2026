# IDEIAS PARA O FUTURO: "Motorsport Mini"

Este documento guarda as nossas sessões de *brainstorming* para futuras expansões do **Mini F1 2026**, transformando-o num simulador multidesportivo ("Motorsport Mini").

## 🏍️ 1. Motociclismo (MotoGP / Superbikes)

- **Arte Pseudo-3D (Renderer)**: Em vez de desenharmos a mota estática vista de cima, a "inclinação" nas curvas será simulada através de deformação visual (*Skew* no Canvas) e deslocação lateral do corpo do piloto.
- **Física Dielétrica**: A mota deitar-se-á conforme o ângulo do volante e a força G (força lateral). O capacete e os ombros do piloto deslocam-se ligeiramente para o lado de dentro da curva no Eixo Y local.
- **Efeitos Especiais**: Quando a inclinação exceder um limiar de agressividade, desenhamos faíscas amarelas a saltar do *curb*, simulando o cotovelo e o joelho de titânio a raspar no alcatrão.

## 🏎️ 2. Carros de Drift (JDM Style)
- **Arte Angular**: A arte baseia-se em carros icónicos modificados, exibindo rodas da frente agressivas e completamente viradas em "contra-brecagem" durante a curva.
- **Física de Derraparem (Slip Angle)**: Os carros terão tração traseira reduzida. O motor matemático permitirá uma diferença enorme entre o ângulo para onde o carro aponta (`car.angle`) e o ângulo matemático para onde se desloca.
- **Efeitos Especiais**: Fumo de pneus volumoso e contínuo gerado matematicamente por trás das rodas de tração sempre que o *Slip Angle* for elevado, deixando o ecrã cheio de nevoeiro opaco.

## 🚙 3. Rally (WRC Style)
- **Track Builder Evoluído**: O *Track Builder Studio* precisaria de uma grande atualização para suportar **Múltiplos Tipos de Terreno** (Asfalto, Terra Batida, Neve, Gelo). Os construtores poderiam "pintar" segmentos da Spline. Cada Nó (Node) teria a sua própria propriedade de `surfaceType`.
- **Física AWD (All-Wheel Drive)**: Tração às quatro rodas! A física leria o terreno abaixo do carro em tempo real. Saltar de Asfalto (onde a tração é imensa) para Terra Batida faria o `grip` cair a pique, obrigando o carro a varrer a curva de lado num *power slide* para não ir contra as árvores.
- **Efeitos Especiais**: Em vez de borracha queimada no asfalto, o rasto deixado pelo carro mudaria de cor. Terra batida atiraria nuvens de pó castanho (partículas que sobem e cobrem os carros atrás); enquanto na Neve levantar-se-iam flocos brancos.
- **Arte do Veículo**: Carros mais "quadrados" com suspensões altas. A arte 2D poderia espelhar o "Dive" (mergulho da suspensão ao travar) aumentando ou diminuindo ligeiramente a escala (Zoom) do capô e da traseira do carro consoante a aceleração para dar ilusão de inércia longitudinal e saltos!

## 🏁 4. Reformulação do Menu Principal (A Garagem do Piloto)
Para suportar esta diversidade, o separador atual de **"TEAMS" (Equipas)** desapareceria totalmente. No seu lugar, surgiria a **"GARAGEM"**:
- O jogador deixa de escolher uma equipa histórica pré-feita e passa a ser o dono da sua frota pessoal.
- Na Garagem, o piloto tem quatro "Slots": **1 F1**, **1 Drift**, **1 Mota** e **1 Rally**.
- O jogador escolhe a classe de veículo que quer levar para a próxima corrida e personaliza simplesmente as duas cores primárias e secundárias do veículo (já existentes no nosso sistema atual).
- A UI mostraria os quatro veículos Lado-a-Lado no ecrã de seleção com a paleta de cores partilhada aplicada em tempo real aos quatro modelos 2D!

## 🌐 5. Multiplayer Localizado (Salas Privadas & PINs)
Com o motor atual a suportar nativamente WebSockets a 60FPS, o desígnio passa por evoluir a arquitetura de "Servidor Global Único" para uma topologia de Múltiplos Hubs (Salas).
- **Criação de Salas**: Na garagem, o jogador passa a ter as opções "Criar Sala" ou "Entrar com Código".
- **Código PIN**: O servidor transfere o conceito de `io.emit()` genérico para instâncias de `io.to('1234').emit()`, permitindo que grupos de amigos corram em canais físicos completamente selados, sem colisões de estados ou de *starts* acidentais entre diferentes grupos que estejam hospedados no mesmo VPS Coolify em simultâneo.
- **Vantagem Tática**: Várias corridas em diferentes continentes e em diferentes pistas a correrem lado-a-lado usando a exata mesma infraestrutura leve em NodeJS sem qualquer sobreposição de memória.
