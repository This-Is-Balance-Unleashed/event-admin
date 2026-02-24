import { useEffect, useRef } from 'react'
import QrScanner from 'qr-scanner'
import { Button } from '@/components/ui/button'
import { X, Camera } from 'lucide-react'

interface QrScannerOverlayProps {
  onScan: (value: string) => void
  onClose: () => void
}

export function QrScannerOverlay({ onScan, onClose }: QrScannerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)

  useEffect(() => {
    if (!videoRef.current) return

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        onScan(result.data)
        scanner.stop()
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      }
    )

    scannerRef.current = scanner
    scanner.start().catch(() => {
      // Camera permission denied or unavailable — close gracefully
      onClose()
    })

    return () => {
      scanner.destroy()
    }
  }, [onScan, onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
      <div className="relative w-full max-w-sm">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -top-12 right-0 text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X className="size-6" />
        </Button>

        {/* Camera feed */}
        <div className="relative overflow-hidden rounded-xl border-2 border-white/30 bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" />
          {/* Corner guides */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-48 relative">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-sm" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-sm" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-sm" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-sm" />
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-white/70">
          Point the camera at the attendee&apos;s QR code
        </p>
      </div>
    </div>
  )
}

// Small trigger button used inside the check-in form
export function ScanQrButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0 h-12 w-12"
      onClick={onClick}
      title="Scan QR code with camera"
    >
      <Camera className="size-5" />
    </Button>
  )
}
