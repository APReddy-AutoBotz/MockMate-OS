import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = 'info',
  duration = 5000,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose?.(id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, id, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-brand-primary" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-error" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-warning" />;
      default:
        return <Info className="w-5 h-5 text-brand-tint" />;
    }
  };

  const getAccentColor = () => {
    switch (type) {
      case 'success': return 'bg-brand-primary';
      case 'error':   return 'bg-error';
      case 'warning': return 'bg-warning';
      default:        return 'bg-brand-tint/60';
    }
  };

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.95 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="
            flex items-center gap-4 p-5 rounded-2xl border backdrop-blur-2xl
            min-w-[320px] max-w-md relative overflow-hidden group
            bg-brand-dark/95 border-white/10 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)]
          "
        >
          {/* Type-specific left accent bar */}
          <div className={`absolute top-0 left-0 w-[3px] h-full ${getAccentColor()} opacity-70 group-hover:opacity-100 transition-opacity`} />

          <div className="flex-shrink-0 ml-2">
            {getIcon()}
          </div>
          <p className="flex-1 text-[13px] font-medium text-white/80 leading-relaxed" style={{ textTransform: 'none' }}>
            {message}
          </p>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose?.(id), 300);
            }}
            className="flex-shrink-0 p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-brand-tint hover:text-white transition-colors" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    message: string;
    type?: ToastType;
    duration?: number;
  }>;
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <div className="pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              className="mb-2"
            >
              <Toast
                id={toast.id}
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
                onClose={onClose}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Toast;
