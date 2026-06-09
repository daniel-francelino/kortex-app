<script setup lang="ts">
import type { GraphData, GraphNode } from '~/types/notes'
import { NOTE_TYPE_META, NoteType } from '~/types/notes'

const props = defineProps<{
  graphData: GraphData | null
  loading: boolean
}>()

const emit = defineEmits<{
  'select-note': [noteId: string]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// ─── Simulation state ─────────────────────────────────────────────────────────
interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

const simNodes = ref<SimNode[]>([])
const simEdges = ref<{ source: string, target: string }[]>([])
let animationId: number | null = null

// Camera
const camera = reactive({ x: 0, y: 0, zoom: 1 })
const dragging = ref<SimNode | null>(null)
const panning = ref(false)
const panStart = reactive({ x: 0, y: 0, camX: 0, camY: 0 })
const hoveredNode = ref<SimNode | null>(null)

// Color map
const TYPE_COLORS: Record<string, string> = {
  [NoteType.Note]: '#6366f1',
  [NoteType.Idea]: '#eab308',
  [NoteType.Concept]: '#06b6d4',
  [NoteType.Research]: '#22c55e',
  [NoteType.BookNote]: '#737373'
}

// ─── Initialize simulation ────────────────────────────────────────────────────
watch(
  () => props.graphData,
  (data) => {
    if (!data) return
    const width = containerRef.value?.clientWidth ?? 800
    const height = containerRef.value?.clientHeight ?? 600

    simNodes.value = data.nodes.map(n => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * width * 0.6,
      y: height / 2 + (Math.random() - 0.5) * height * 0.6,
      vx: 0,
      vy: 0,
      radius: Math.max(6, Math.min(20, 6 + (n.linkCount ?? 0) * 2))
    }))

    simEdges.value = data.edges.map(e => ({ source: e.source, target: e.target }))

    startSimulation()
  },
  { immediate: true }
)

function startSimulation(): void {
  if (animationId) cancelAnimationFrame(animationId)

  let iterationsLeft = 300

  function tick(): void {
    if (iterationsLeft <= 0) {
      draw()
      return
    }
    iterationsLeft--
    simulate()
    draw()
    animationId = requestAnimationFrame(tick)
  }

  animationId = requestAnimationFrame(tick)
}

function simulate(): void {
  const nodes = simNodes.value
  const edges = simEdges.value
  const alpha = 0.3
  const repulsion = 2000
  const attraction = 0.005
  const centerForce = 0.01
  const damping = 0.85

  const width = containerRef.value?.clientWidth ?? 800
  const height = containerRef.value?.clientHeight ?? 600
  const cx = width / 2
  const cy = height / 2

  // Repulsion (all pairs)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j]!.x - nodes[i]!.x
      const dy = nodes[j]!.y - nodes[i]!.y
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const force = repulsion / (dist * dist)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      nodes[i]!.vx -= fx * alpha
      nodes[i]!.vy -= fy * alpha
      nodes[j]!.vx += fx * alpha
      nodes[j]!.vy += fy * alpha
    }
  }

  // Attraction (edges)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  for (const edge of edges) {
    const s = nodeMap.get(edge.source)
    const t = nodeMap.get(edge.target)
    if (!s || !t) continue
    const dx = t.x - s.x
    const dy = t.y - s.y
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
    const force = dist * attraction
    s.vx += dx * force * alpha
    s.vy += dy * force * alpha
    t.vx -= dx * force * alpha
    t.vy -= dy * force * alpha
  }

  // Center force
  for (const node of nodes) {
    node.vx += (cx - node.x) * centerForce * alpha
    node.vy += (cy - node.y) * centerForce * alpha
  }

  // Apply velocity
  for (const node of nodes) {
    if (dragging.value && node.id === dragging.value.id) continue
    node.vx *= damping
    node.vy *= damping
    node.x += node.vx
    node.y += node.vy
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = containerRef.value?.clientWidth ?? 800
  const height = containerRef.value?.clientHeight ?? 600
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.zoom, camera.zoom)

  const nodes = simNodes.value
  const edges = simEdges.value
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Draw edges
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(120, 120, 140, 0.3)'
  for (const edge of edges) {
    const s = nodeMap.get(edge.source)
    const t = nodeMap.get(edge.target)
    if (!s || !t) continue
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.stroke()
  }

  // Draw nodes
  for (const node of nodes) {
    const isHovered = hoveredNode.value?.id === node.id
    const color = TYPE_COLORS[node.type] ?? '#6366f1'

    // Glow on hover
    if (isHovered) {
      ctx.shadowColor = color
      ctx.shadowBlur = 12
    }

    ctx.beginPath()
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    if (isHovered) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Label
    ctx.fillStyle = isHovered ? '#fff' : 'rgba(200, 200, 220, 0.85)'
    ctx.font = `${isHovered ? 'bold ' : ''}${Math.max(10, node.radius * 0.9)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const label = node.title.length > 20 ? `${node.title.slice(0, 18)}…` : node.title
    ctx.fillText(label, node.x, node.y + node.radius + 4)
  }

  ctx.restore()
}

// ─── Mouse interactions ───────────────────────────────────────────────────────

function screenToWorld(sx: number, sy: number): { x: number, y: number } {
  return {
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom
  }
}

function findNodeAt(wx: number, wy: number): SimNode | null {
  for (const node of simNodes.value) {
    const dx = wx - node.x
    const dy = wy - node.y
    if (dx * dx + dy * dy <= (node.radius + 4) ** 2) return node
  }
  return null
}

function onMouseDown(e: MouseEvent): void {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
  const node = findNodeAt(world.x, world.y)

  if (node) {
    dragging.value = node
  } else {
    panning.value = true
    panStart.x = e.clientX
    panStart.y = e.clientY
    panStart.camX = camera.x
    panStart.camY = camera.y
  }
}

function onMouseMove(e: MouseEvent): void {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

  if (dragging.value) {
    dragging.value.x = world.x
    dragging.value.y = world.y
    dragging.value.vx = 0
    dragging.value.vy = 0
    draw()
  } else if (panning.value) {
    camera.x = panStart.camX + (e.clientX - panStart.x)
    camera.y = panStart.camY + (e.clientY - panStart.y)
    draw()
  } else {
    const node = findNodeAt(world.x, world.y)
    if (node !== hoveredNode.value) {
      hoveredNode.value = node
      if (canvasRef.value) {
        canvasRef.value.style.cursor = node ? 'pointer' : 'grab'
      }
      draw()
    }
  }
}

function onMouseUp(): void {
  if (dragging.value) {
    // If barely moved, treat as click → select
    emit('select-note', dragging.value.id)
  }
  dragging.value = null
  panning.value = false
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(0.2, Math.min(5, camera.zoom * delta))

  // Zoom toward mouse position
  camera.x = mx - (mx - camera.x) * (newZoom / camera.zoom)
  camera.y = my - (my - camera.y) * (newZoom / camera.zoom)
  camera.zoom = newZoom

  draw()
}

function resetView(): void {
  camera.x = 0
  camera.y = 0
  camera.zoom = 1
  draw()
}

// Handle resize
function onResize(): void {
  draw()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
})

// Legend
const typeLegend = computed(() =>
  Object.entries(NOTE_TYPE_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    color: TYPE_COLORS[key] ?? '#6366f1'
  }))
)
</script>

<template>
  <div ref="containerRef" class="relative w-full h-full bg-default">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="text-center space-y-2">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
        <p class="text-sm text-muted">
          Carregando grafo...
        </p>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!graphData || graphData.nodes.length === 0"
      class="flex flex-col items-center justify-center h-full gap-4"
    >
      <UIcon name="i-lucide-network" class="size-16 text-dimmed" />
      <p class="text-muted text-sm">
        Crie notas e vínculos para visualizar o grafo
      </p>
    </div>

    <!-- Canvas -->
    <template v-else>
      <canvas
        ref="canvasRef"
        class="w-full h-full cursor-grab"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @wheel="onWheel"
      />

      <!-- Controls overlay -->
      <div class="absolute top-3 right-3 flex flex-col gap-1">
        <UButton
          icon="i-lucide-maximize-2"
          size="xs"
          color="neutral"
          variant="subtle"
          @click="resetView"
        />
        <UButton
          icon="i-lucide-zoom-in"
          size="xs"
          color="neutral"
          variant="subtle"
          @click="camera.zoom = Math.min(5, camera.zoom * 1.2); draw()"
        />
        <UButton
          icon="i-lucide-zoom-out"
          size="xs"
          color="neutral"
          variant="subtle"
          @click="camera.zoom = Math.max(0.2, camera.zoom * 0.8); draw()"
        />
      </div>

      <!-- Legend overlay -->
      <div class="absolute bottom-3 left-3 bg-elevated/90 backdrop-blur-sm rounded-lg px-3 py-2">
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <div
            v-for="item in typeLegend"
            :key="item.key"
            class="flex items-center gap-1.5 text-xs text-muted"
          >
            <span
              class="inline-block size-3 rounded-full"
              :style="{ backgroundColor: item.color }"
            />
            {{ item.label }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
