export class WavRecorder {
  private context: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private stream: MediaStream | null = null
  private chunks: Float32Array[] = []

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        channelCount: 1, 
        echoCancellation: true, 
        noiseSuppression: true 
      } 
    })
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    this.context = new AudioContextClass({ sampleRate: 16000 })
    
    const source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(4096, 1, 1)

    this.processor.onaudioprocess = (e) => {
      if (!this.context) return
      const channelData = e.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(channelData))
    }

    source.connect(this.processor)
    // Connect to destination so the script processor actually runs, but we mute it so there's no feedback
    const gainNode = this.context.createGain()
    gainNode.gain.value = 0
    this.processor.connect(gainNode)
    gainNode.connect(this.context.destination)
  }

  async stop(): Promise<Blob> {
    if (!this.processor || !this.context) return new Blob([])
    
    this.processor.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    
    const length = this.chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const result = new Float32Array(length)
    let offset = 0
    for (const chunk of this.chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }

    const originalSampleRate = this.context.sampleRate
    
    // Cleanup capture context
    this.context.close()
    this.context = null
    this.processor = null
    this.chunks = []
    this.stream = null

    // Downsample to exactly 16000Hz using OfflineAudioContext
    const targetSampleRate = 16000
    const duration = length / originalSampleRate
    const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext
    const offlineContext = new OfflineContextClass(1, targetSampleRate * duration, targetSampleRate)
    
    const buffer = offlineContext.createBuffer(1, length, originalSampleRate)
    buffer.getChannelData(0).set(result)
    
    const source = offlineContext.createBufferSource()
    source.buffer = buffer
    source.connect(offlineContext.destination)
    source.start(0)
    
    const renderedBuffer = await offlineContext.startRendering()
    const downsampledData = renderedBuffer.getChannelData(0)
    
    // Build WAV blob
    const wavBuffer = new ArrayBuffer(44 + downsampledData.length * 2)
    const view = new DataView(wavBuffer)
    
    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }
    
    // RIFF header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + downsampledData.length * 2, true)
    writeString(view, 8, 'WAVE')
    // fmt chunk
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, targetSampleRate, true)
    view.setUint32(28, targetSampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    // data chunk
    writeString(view, 36, 'data')
    view.setUint32(40, downsampledData.length * 2, true)

    // PCM data
    let index = 44
    for (let i = 0; i < downsampledData.length; i++) {
      let s = Math.max(-1, Math.min(1, downsampledData[i]))
      view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      index += 2
    }

    return new Blob([view], { type: 'audio/wav' })
  }
}
