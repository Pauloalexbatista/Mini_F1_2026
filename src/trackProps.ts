export interface TrackProp {
  id: string;
  type: 'truck' | 'grandstand' | 'sponsor_bridge' | 'billboard';
  variant: string;
  x: number; // studio coordinates (0-1000)
  y: number; // studio coordinates (0-750)
  angle: number; // radians
  scale?: number;
}

export interface PropCatalogItem {
  type: 'truck' | 'grandstand' | 'sponsor_bridge' | 'billboard';
  variant: string;
  name: string;
  category: 'Camiões Paddock' | 'Bancadas' | 'Pórticos Aéreos' | 'Painéis Curva';
  color: string;
  desc: string;
}

export const PROP_CATALOG: PropCatalogItem[] = [
  // Camiões
  { type: 'truck', variant: 'truck_ferrari', name: 'Ferrari F1 Transporter', category: 'Camiões Paddock', color: '#DC0000', desc: 'Camião oficial Scuderia Ferrari' },
  { type: 'truck', variant: 'truck_mercedes', name: 'Mercedes-AMG Transporter', category: 'Camiões Paddock', color: '#00D2BE', desc: 'Camião oficial Mercedes Petronas' },
  { type: 'truck', variant: 'truck_redbull', name: 'Red Bull Racing Transporter', category: 'Camiões Paddock', color: '#0A0E2A', desc: 'Camião oficial Red Bull Racing' },
  { type: 'truck', variant: 'truck_mclaren', name: 'McLaren F1 Transporter', category: 'Camiões Paddock', color: '#FF8000', desc: 'Camião oficial McLaren Papaya' },
  { type: 'truck', variant: 'truck_aston', name: 'Aston Martin F1 Transporter', category: 'Camiões Paddock', color: '#00594F', desc: 'Camião oficial British Racing Green' },
  { type: 'truck', variant: 'truck_cocacola', name: 'Camião Coca-Cola', category: 'Camiões Paddock', color: '#DF0015', desc: 'Camião clássico com logotipo Coca-Cola' },
  { type: 'truck', variant: 'truck_pepsi', name: 'Camião Pepsi', category: 'Camiões Paddock', color: '#004B93', desc: 'Camião com logotipo circular Pepsi' },
  { type: 'truck', variant: 'truck_esso', name: 'Camião Esso / Mobil 1', category: 'Camiões Paddock', color: '#FFFFFF', desc: 'Camião de combustível e lubrificantes' },

  // Pórticos Aéreos (Passam por cima da pista!)
  { type: 'sponsor_bridge', variant: 'bridge_rolex', name: 'Pórtico Rolex', category: 'Pórticos Aéreos', color: '#006039', desc: 'Ponte aérea que cruza a pista (Verde/Ouro)' },
  { type: 'sponsor_bridge', variant: 'bridge_pirelli', name: 'Pórtico Pirelli', category: 'Pórticos Aéreos', color: '#FED100', desc: 'Ponte aérea clássica amarela/vermelha' },
  { type: 'sponsor_bridge', variant: 'bridge_aramco', name: 'Pórtico Aramco', category: 'Pórticos Aéreos', color: '#00A3E0', desc: 'Ponte aérea patrocinador oficial Aramco' },
  { type: 'sponsor_bridge', variant: 'bridge_emirates', name: 'Pórtico Fly Emirates', category: 'Pórticos Aéreos', color: '#D71A21', desc: 'Ponte aérea vermelha Emirates' },

  // Bancadas
  { type: 'grandstand', variant: 'stand_red', name: 'Bancada Tifosi (Vermelha)', category: 'Bancadas', color: '#C00000', desc: 'Bancada grande com adeptos e toldo vermelho' },
  { type: 'grandstand', variant: 'stand_blue', name: 'Bancada VIP Moderna', category: 'Bancadas', color: '#1B365D', desc: 'Bancada com cobertura moderna aerodinâmica' },
  { type: 'grandstand', variant: 'stand_silver', name: 'Bancada Central Meta', category: 'Bancadas', color: '#888888', desc: 'Bancada em arco metálico de grande capacidade' },

  // Painéis de Curva
  { type: 'billboard', variant: 'billboard_pirelli', name: 'Painel Curva Pirelli', category: 'Painéis Curva', color: '#FED100', desc: 'Outdoor de berma amarelo/vermelho' },
  { type: 'billboard', variant: 'billboard_rolex', name: 'Painel Curva Rolex', category: 'Painéis Curva', color: '#006039', desc: 'Outdoor de berma verde com ouro' },
  { type: 'billboard', variant: 'billboard_cocacola', name: 'Painel Curva Coca-Cola', category: 'Painéis Curva', color: '#DF0015', desc: 'Outdoor de berma vermelho Coca-Cola' },
  { type: 'billboard', variant: 'billboard_heineken', name: 'Painel Curva Heineken', category: 'Painéis Curva', color: '#007A33', desc: 'Outdoor de berma verde com estrela vermelha' },
];

// DESENHO EM STUDIO (TRACKBUILDER CANVAS: 1000x750)
export function drawPropStudio(ctx: CanvasRenderingContext2D, prop: TrackProp, isSelected = false) {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.angle);

  // Escala reduzida no editor para caber bem
  if (prop.type === 'truck') {
    // Mini-camião no editor
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-18, -6, 36, 12);
    
    // Cabine
    ctx.fillStyle = '#222';
    ctx.fillRect(10, -5, 7, 10);
    // Para-brisas
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(13, -4, 3, 8);

    // Cor da carroçaria / reboque
    const catalogItem = PROP_CATALOG.find(p => p.variant === prop.variant);
    ctx.fillStyle = catalogItem?.color || '#DC0000';
    ctx.fillRect(-17, -5, 26, 10);

  } else if (prop.type === 'grandstand') {
    // Mini-bancada
    ctx.fillStyle = '#333338';
    ctx.fillRect(-22, -9, 44, 18);
    ctx.fillStyle = prop.variant === 'stand_red' ? '#990000' : (prop.variant === 'stand_blue' ? '#003366' : '#555');
    ctx.fillRect(-20, -7, 40, 14);
    // Linhas de degraus
    ctx.fillStyle = '#FFF';
    ctx.fillRect(-18, -4, 36, 1);
    ctx.fillRect(-18, 0, 36, 1);
    ctx.fillRect(-18, 4, 36, 1);

  } else if (prop.type === 'sponsor_bridge') {
    // Pórtico aéreo
    ctx.fillStyle = '#111';
    ctx.fillRect(-28, -5, 56, 10);
    const catalogItem = PROP_CATALOG.find(p => p.variant === prop.variant);
    ctx.fillStyle = catalogItem?.color || '#FED100';
    ctx.fillRect(-24, -3, 48, 6);
    // Pilares nos extremos
    ctx.fillStyle = '#FFF';
    ctx.fillRect(-28, -6, 4, 12);
    ctx.fillRect(24, -6, 4, 12);

  } else if (prop.type === 'billboard') {
    // Painel de curva
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-14, -3, 28, 6);
    const catalogItem = PROP_CATALOG.find(p => p.variant === prop.variant);
    ctx.fillStyle = catalogItem?.color || '#FED100';
    ctx.fillRect(-13, -2, 26, 4);
  }

  // Se estiver selecionado, desenha anel de destaque
  if (isSelected) {
    ctx.strokeStyle = '#00FF66';
    ctx.lineWidth = 2;
    ctx.strokeRect(-25, -12, 50, 24);
  }

  ctx.restore();
}

// DESENHO NO MUNDO DE JOGO (ESCALA MUNDIAL: 15.0x STUDIO)
export function drawTrackPropWorld(ctx: CanvasRenderingContext2D, prop: TrackProp, layer: 'ground' | 'overhead') {
  // Coordenadas mundiais: multiplicamos por 15.0
  const wx = prop.x * 15.0;
  const wy = prop.y * 15.0;

  // OS PÓRTICOS AÉREOS:
  // A sombra é desenhada no 'ground', e o pórtico com texto é desenhado no 'overhead' (depois dos carros!)
  if (prop.type === 'sponsor_bridge') {
    if (layer === 'ground') {
      // Sombra projetada da ponte sobre a pista
      ctx.save();
      ctx.translate(wx + 20, wy + 25);
      ctx.rotate(prop.angle);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(-160, -18, 320, 36);
      // Pilares de sustentação no chão
      ctx.fillStyle = '#111';
      ctx.fillRect(-165, -25, 20, 50);
      ctx.fillRect(145, -25, 20, 50);
      ctx.fillStyle = '#FFDD00';
      ctx.fillRect(-160, -22, 10, 8);
      ctx.fillRect(150, -22, 10, 8);
      ctx.restore();
      return;
    }

    if (layer === 'overhead') {
      // Estrutura suspensa desenhada por cima dos carros!
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(prop.angle);

      // Sombra 3D interna
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 15;

      // Tabuleiro principal
      ctx.fillStyle = '#15151e';
      ctx.fillRect(-160, -18, 320, 36);
      ctx.shadowColor = 'transparent';

      // Cor da Marca e Logotipo
      if (prop.variant === 'bridge_rolex') {
        ctx.fillStyle = '#006039';
        ctx.fillRect(-150, -14, 300, 28);
        ctx.fillStyle = '#D4AF37';
        ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?  R O L E X  ?', 0, 1);
      } else if (prop.variant === 'bridge_pirelli') {
        ctx.fillStyle = '#FED100';
        ctx.fillRect(-150, -14, 300, 28);
        ctx.fillStyle = '#D50000';
        ctx.font = '900 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P I R E L L I', 0, 1);
      } else if (prop.variant === 'bridge_aramco') {
        ctx.fillStyle = '#00A3E0';
        ctx.fillRect(-150, -14, 300, 28);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('a r a m c o', 0, 1);
      } else if (prop.variant === 'bridge_emirates') {
        ctx.fillStyle = '#D71A21';
        ctx.fillRect(-150, -14, 300, 28);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Fly Emirates', 0, 1);
      } else {
        ctx.fillStyle = '#E10600';
        ctx.fillRect(-150, -14, 300, 28);
        ctx.fillStyle = '#FFF';
        ctx.font = '900 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FORMULA 1 2026', 0, 1);
      }

      // Treliça metálica nas bordas da ponte
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      ctx.strokeRect(-160, -18, 320, 36);

      ctx.restore();
      return;
    }
  }

  // Todos os restantes props pertencem exclusivamente ao layer 'ground'
  if (layer !== 'ground') return;

  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(prop.angle);

  // SOMBRA REALISTA DO OBJETO
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 10;
  ctx.shadowOffsetY = 12;

  // 1. CAMIÕES / RACE TRANSPORTERS (Escala: ~120px comp x 38px larg)
  if (prop.type === 'truck') {
    // Chassi negro / sombras de rodas
    ctx.fillStyle = '#111116';
    ctx.fillRect(-62, -18, 124, 36);
    ctx.shadowColor = 'transparent'; // Reset de sombra para os detalhes

    // CABINE DO CAMIÃO (À frente, lado direito com x positivo)
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath();
    ctx.roundRect(36, -17, 26, 34, [0, 8, 8, 0]);
    ctx.fill();

    // Para-brisas com reflexo fumado
    ctx.fillStyle = '#2a3b5c';
    ctx.fillRect(48, -13, 8, 26);
    ctx.fillStyle = '#5c8ad6';
    ctx.fillRect(49, -11, 3, 22);

    // Defletor aerodinâmico no tejadilho da cabine
    const catalogItem = PROP_CATALOG.find(p => p.variant === prop.variant);
    const brandColor = catalogItem?.color || '#C00000';
    ctx.fillStyle = brandColor;
    ctx.fillRect(38, -14, 9, 28);

    // Espelhos retrovisores
    ctx.fillStyle = '#000';
    ctx.fillRect(52, -19, 4, 3);
    ctx.fillRect(52, 16, 4, 3);

    // REBOQUE DO CAMIÃO (Traseira longa: de x=-60 até x=34)
    ctx.fillStyle = '#18181f';
    ctx.fillRect(-60, -17, 94, 34);

    // Tejadilho com cores da marca
    ctx.fillStyle = brandColor;
    ctx.fillRect(-58, -15, 90, 30);

    // DECORAÇÃO ESPECÍFICA DE CADA MARCA NO TETO DO REBOQUE
    if (prop.variant === 'truck_ferrari') {
      // Faixa central branca/preta
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-58, -4, 90, 8);
      ctx.fillStyle = '#000000';
      ctx.fillRect(-58, -2, 90, 4);
      // Escudo amarelo Ferrari
      ctx.fillStyle = '#FED100';
      ctx.beginPath();
      ctx.arc(-15, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SF', -15, 1);
    } else if (prop.variant === 'truck_mercedes') {
      // Faixas turquesa Petronas
      ctx.fillStyle = '#00D2BE';
      ctx.fillRect(-58, -11, 90, 4);
      ctx.fillRect(-58, 7, 90, 4);
      // Estrela Mercedes no centro
      ctx.fillStyle = '#CCCCCC';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('? AMG', -10, 0);
    } else if (prop.variant === 'truck_redbull') {
      // Sol dourado e touros
      ctx.fillStyle = '#FFC700';
      ctx.beginPath();
      ctx.arc(-12, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#E10600';
      ctx.font = '900 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RED BULL', -10, 0);
    } else if (prop.variant === 'truck_mclaren') {
      // Faixa azul no laranja
      ctx.fillStyle = '#000033';
      ctx.fillRect(-58, -6, 90, 12);
      ctx.fillStyle = '#FFF';
      ctx.font = '900 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('McLAREN', -10, 0);
    } else if (prop.variant === 'truck_aston') {
      // Linha lima no verde inglês
      ctx.fillStyle = '#CEDC00';
      ctx.fillRect(-58, -2, 90, 4);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ASTON MARTIN', -10, -5);
    } else if (prop.variant === 'truck_cocacola') {
      // Onda branca Coca-Cola
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(-15, 0, 30, 6, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#DF0015';
      ctx.beginPath();
      ctx.ellipse(-15, 2, 28, 4, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Coca-Cola', -12, 0);
    } else if (prop.variant === 'truck_pepsi') {
      // Círculo Pepsi
      ctx.fillStyle = '#FFF';
      ctx.beginPath(); ctx.arc(-15, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#DF0015';
      ctx.beginPath(); ctx.arc(-15, 0, 7, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#004B93';
      ctx.beginPath(); ctx.arc(-15, 0, 7, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = '900 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PEPSI', 10, 0);
    } else if (prop.variant === 'truck_esso') {
      ctx.fillStyle = '#003399';
      ctx.fillRect(-58, -13, 90, 4);
      ctx.fillStyle = '#E10600';
      ctx.fillRect(-58, 9, 90, 4);
      ctx.fillStyle = '#E10600';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ESSO', -15, 0);
    }
  }

  // 2. BANCADAS DE ESPECTADORES (Escala: ~220px comp x 75px larg)
  else if (prop.type === 'grandstand') {
    // Base de betão
    ctx.fillStyle = '#2d2d38';
    ctx.fillRect(-110, -38, 220, 76);
    ctx.shadowColor = 'transparent';

    // 8 Filas de Degraus
    const rows = 8;
    const rowH = 70 / rows;
    const fanColors = ['#E10600', '#FFDD00', '#00D2BE', '#FFFFFF', '#00594F', '#004B93', '#FF8000'];

    for (let r = 0; r < rows; r++) {
      const ry = -35 + r * rowH;
      // Degrau
      ctx.fillStyle = r % 2 === 0 ? '#383845' : '#2a2a35';
      ctx.fillRect(-106, ry, 212, rowH - 1);

      // Multidão (cadeiras/espectadores pontilhados com bonés e camisolas)
      for (let f = 0; f < 24; f++) {
        const fx = -100 + f * 8.6;
        const colorIdx = (r * 13 + f * 7 + Math.floor(prop.x)) % fanColors.length;
        ctx.fillStyle = fanColors[colorIdx];
        ctx.beginPath();
        ctx.arc(fx, ry + rowH / 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Toldo / Cobertura translúcida e armação
    const isRed = prop.variant === 'stand_red';
    const isBlue = prop.variant === 'stand_blue';
    ctx.fillStyle = isRed ? 'rgba(180, 0, 0, 0.45)' : (isBlue ? 'rgba(0, 50, 130, 0.45)' : 'rgba(230, 230, 230, 0.45)');
    ctx.fillRect(-110, -38, 220, 28);

    // Vigas metálicas brancas da armação do teto
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    for (let b = -100; b <= 100; b += 25) {
      ctx.beginPath();
      ctx.moveTo(b, -38);
      ctx.lineTo(b, -10);
      ctx.stroke();
    }

    // Faixa frontal da bancada
    ctx.fillStyle = isRed ? '#C00000' : (isBlue ? '#003366' : '#222');
    ctx.fillRect(-110, 32, 220, 6);
  }

  // 3. PLACARES DE BERMA / OUTDOORS (Escala: ~110px comp x 20px larg)
  else if (prop.type === 'billboard') {
    // Postes traseiros
    ctx.fillStyle = '#111';
    ctx.fillRect(-52, -9, 8, 18);
    ctx.fillRect(44, -9, 8, 18);
    ctx.shadowColor = 'transparent';

    // Face do painel
    ctx.fillStyle = '#222';
    ctx.fillRect(-55, -7, 110, 14);

    if (prop.variant === 'billboard_pirelli') {
      ctx.fillStyle = '#FED100';
      ctx.fillRect(-53, -6, 106, 12);
      ctx.fillStyle = '#E10600';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PIRELLI', 0, 0);
    } else if (prop.variant === 'billboard_rolex') {
      ctx.fillStyle = '#006039';
      ctx.fillRect(-53, -6, 106, 12);
      ctx.fillStyle = '#D4AF37';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ROLEX', 0, 0);
    } else if (prop.variant === 'billboard_cocacola') {
      ctx.fillStyle = '#DF0015';
      ctx.fillRect(-53, -6, 106, 12);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 9px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Coca-Cola', 0, 0);
    } else if (prop.variant === 'billboard_heineken') {
      ctx.fillStyle = '#007A33';
      ctx.fillRect(-53, -6, 106, 12);
      ctx.fillStyle = '#FFF';
      ctx.font = '900 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('? Heineken', 0, 0);
    }
  }

  ctx.restore();
}

// FUNÇÃO UTILITÁRIA PARA DESENHAR TODOS OS PROPS
export function drawAllTrackProps(ctx: CanvasRenderingContext2D, props: TrackProp[] | undefined, layer: 'ground' | 'overhead') {
  if (!props || props.length === 0) return;
  for (let i = 0; i < props.length; i++) {
    drawTrackPropWorld(ctx, props[i], layer);
  }
}
