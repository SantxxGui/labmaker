# Máquinas conectadas

Como o LabMaker enxerga e comanda as máquinas do espaço maker (impressoras 3D, cortadoras a laser e plotters de recorte): telemetria, alarmes, câmeras e comandos remotos.

> **Estado atual:** a arquitetura, o banco, a API, as regras de segurança e as telas estão prontos. A leitura das máquinas é feita por um **simulador determinístico** (`lib/telemetria.ts`) com o mesmo formato de dados que o gateway real entregaria. Trocar o simulador por um driver real não muda controllers, rotas nem telas.

## 1. Dá para acessar a máquina só pelo IP?

Dá, mas **não diretamente pelo navegador** e **não pela internet**. O desenho é este:

```
 Rede das máquinas (espaço maker)          Gateway no espaço            Servidor / nuvem
┌──────────────────────────────────┐      ┌───────────────────┐       ┌─────────────────────────┐
│ Bambu X1C    10.20.30.13 (MQTT)   │──┐   │ Raspberry Pi      │ HTTPS │                         │
│ Prusa MK4S   10.20.30.11 (MQTT)   │──┤   │ · cliente MQTT    │──────▶│ API LabMaker (Next.js)  │──▶ Navegador
│ Laser CO2    10.20.30.21 (ponte)  │──┼──▶│ · ponte do laser  │ mTLS  │ controllers + RBAC      │   (só HTTPS)
│ Plotter      10.20.30.32 (ponte)  │──┤   │ · MediaMTX (vídeo)│       │ PostgreSQL              │
│ Câmeras IP   rtsp://…:554         │──┘   └───────────────────┘       └─────────────────────────┘
└──────────────────────────────────┘
```

- **Um gateway no espaço** (um Raspberry Pi ou mini-PC) fica na mesma rede das máquinas. É ele que conhece os IPs e fala a "língua" de cada fabricante.
- **O LabMaker conversa só com o gateway**, por HTTPS com certificado (mTLS) ou VPN. A rede das máquinas fica separada da rede dos alunos.
- **O navegador nunca recebe o IP nem a URL da câmera.** A API só expõe `temCamera: true/false`.
- O campo `enderecoIp` da máquina é a identidade usada pelo gateway (único entre máquinas ativas — índice parcial no banco).

É o mesmo princípio de segmentação usado na indústria (IEC 62443): máquinas numa rede isolada, um único ponto de passagem controlado e auditado.

## 2. Como cada máquina conversa

| Máquina | Como o gateway lê e comanda | O que chega no LabMaker |
|---|---|---|
| **Bambu Lab X1C** | MQTT local da impressora (modo LAN) | Temperaturas, progresso, camada, AMS, códigos HMS, pausar/retomar/cancelar |
| **Prusa MK4S** | PrusaLink / Prusa Connect (HTTP/MQTT) | Temperaturas, progresso, tempo restante, erros, pausar/cancelar |
| **Impressora de resina** | Rede da impressora ou placa ESP32 | Estado, camada, tempo restante |
| **Laser CO2** (controladora Ruida) | Ponte UDP/LightBurn + sensores (água do chiller, tampa, exaustão) por ESP32/MQTT | Potência, água, exaustão, tampa aberta, pausar |
| **Plotter de recorte** | Ponte USB ↔ rede no gateway | Força da lâmina, velocidade, mídia, erro de registro |

O protocolo de cada máquina é o campo `protocolo` da tabela `equipamentos` (enum `ProtocoloIndustrial`, que também cobre OPC UA, MTConnect, Modbus e SCPI caso o espaço receba máquinas industriais).

## 3. Câmeras

1. A câmera IP fica na rede OT e publica vídeo em **RTSP** (`rtsp://IP:554/stream1`).
2. O gateway roda um servidor de mídia (**MediaMTX** ou **go2rtc**, ambos open source) que converte RTSP em **WebRTC** — latência abaixo de 1 s, roda direto no `<video>` do navegador, sem plugin.
3. A API entrega ao navegador um link temporário assinado do stream (ou o navegador pede pelo gateway, com o cookie de sessão validado). O IP da câmera nunca chega ao cliente.

Na demonstração, a imagem é **sintetizada em canvas** a partir do estado real da telemetria (`components/industrial/camera-feed.tsx`): a máquina operando mexe, pausada para, offline mostra *SEM SINAL*.

## 4. Telemetria e alarmes

- **Leitura:** `GET /api/maquinas/telemetria` (todas) e `GET /api/equipamentos/:id/telemetria?serie=1` (uma, com série recente). A tela consulta a cada 2–2,5 s. Em produção, o próximo passo é *Server-Sent Events* a partir do gateway.
- **Formato:** `TelemetriaDTO` — estado efetivo, online, latência, programa, progresso, OEE e métricas com faixa operacional (`min`/`max`) e flag `alerta`.
- **Estado efetivo** (`estadoEfetivo()`): `OFFLINE` vence tudo; equipamento em manutenção aparece como `MANUTENCAO`; senão vale o estado físico (`OPERANDO`, `OCIOSO`, `PAUSADO`, `ALARME`).
- **Alarmes** (tabela `alarmes`): código do fabricante (`M-301`, `E-2041`, `NET-01`…), mensagem, severidade (`INFO`, `AVISO`, `CRITICO`), início, encerramento e reconhecimento (quem e quando). O gateway cria o alarme quando o controlador o dispara; `NET-01` é gerado pelo próprio gateway quando o heartbeat falha.
- **Encerramento:** ao registrar uma manutenção com "liberar equipamento", os alarmes ativos são encerrados e a máquina volta a `OCIOSO`.

## 5. Comandos remotos — o que é permitido e por quê

| Comando | Quando é aceito | Efeito |
|---|---|---|
| Pausar (impressão/corte) | máquina `OPERANDO` | → `PAUSADO` (ex.: trocar filamento) |
| Retomar ciclo | máquina `PAUSADO` **e sem alarme crítico ativo** | → `OPERANDO` |
| Parar ciclo (cancelar) | `OPERANDO`, `PAUSADO` ou `ALARME`; **justificativa obrigatória** | → `OCIOSO` |
| Reconhecer alarmes | existe alarme ativo não reconhecido | registra quem reconheceu |

Regras implementadas em `avaliarComando()` (`lib/telemetria.ts`) e cobertas por testes:

- **Máquina offline** → todo comando é recusado ("não entregue").
- **Equipamento em manutenção** → só *parar ciclo* é aceito.
- **Alarme crítico** → retomada remota bloqueada; a liberação é local, após a manutenção.
- **Todo comando é registrado**, inclusive os recusados (tabela `comandos_remotos`, status `EXECUTADO`/`REJEITADO`, com motivo) e vai para a auditoria (`maquina.comando`, `maquina.comando_rejeitado`, `maquina.alarmes_reconhecidos`).
- **Permissões:** `maquina:monitorar` e `maquina:comandar` para o Líder e o Professor(a); cadastrar máquinas só o Líder. O aluno não vê a central (só o inventário e a reserva).
- **Máquina sem IP do gateway** nasce como *sem conexão*: continua disponível para reserva, mas o sistema não inventa telemetria para ela.

### O que o sistema **não** faz, de propósito (segurança do laser e NR-12)

- **Ligar o laser ou iniciar um corte à distância.** Laser CO2 pode pegar fogo no material: só se inicia com alguém na frente da máquina, com a tampa fechada e a exaustão ligada.
- **Parada de emergência remota.** O botão de emergência e o intertravamento da tampa são físicos, no local (princípio da NR-12). Software de supervisão não substitui isso.
- **Iniciar impressão sem conferir a mesa.** A mesa precisa estar limpa e vazia; a partida é local (ou pelo aluno, na própria impressora).

## 6. Do simulador para máquinas reais

1. Instalar o gateway no espaço (Raspberry Pi 5 com Docker): cliente MQTT para Bambu/Prusa, ponte do laser e do plotter, sensores ESP32 (água do chiller, tampa, exaustão) e MediaMTX para vídeo.
2. Liberar no firewall **somente** gateway → máquinas e gateway → API (443). Nada da internet direto para a rede das máquinas.
3. Implementar o *adapter* que hoje é `lerTelemetria()`: em vez de calcular, consulta o último valor recebido do gateway. As telas e a API continuam iguais.
4. Em `MaquinaController.comandar`, depois de aprovado pelas regras, enviar o comando ao gateway e aguardar confirmação do controlador antes de gravar `EXECUTADO`.
5. Homologar com o TI da faculdade: rede separada para as máquinas, certificados e testes máquina a máquina.

## 7. Onde está no código

| Camada | Arquivo |
|---|---|
| Simulador, estado efetivo, regras de comando | `lib/telemetria.ts` |
| Banco | `prisma/schema.prisma` (`Alarme`, `ComandoRemoto`, campos de rede em `Equipamento`) · `prisma/migrations/0002_conectividade` |
| Model | `models/alarme.model.ts` · `models/equipamento.model.ts` (`paraTelemetria`, `buscarParaComando`, `atualizarEstado`) |
| Controller | `controllers/maquina.controller.ts` |
| Rotas | `app/api/maquinas/telemetria` · `app/api/alarmes` · `app/api/equipamentos/[id]/{telemetria,alarmes,comandos}` |
| Telas | `views/maquinas/*` · `components/industrial/*` (cena animada e câmera) |
| Testes | `tests/telemetria.test.ts` |
