import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/**
 * Properties structure for the Modal component.
 */
interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

/**
 * Reusable modal overlay dialog component.
 */
export function Modal({ title, children, onClose, className }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button close" onClick={onClose} title="Close dialog">
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
