'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, CreditCard, Smartphone } from 'lucide-react';

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  planName: string;
  interval: 'month' | 'year';
  amount: number; // 分
  onSuccess?: () => void;
}

type PayMethod = 'alipay' | 'wechat';
type PaymentStatus = 'idle' | 'creating' | 'pending' | 'success' | 'failed';

export function PaymentDialog({
  open,
  onOpenChange,
  planId,
  planName,
  interval,
  amount,
  onSuccess,
}: PaymentDialogProps) {
  const [payMethod, setPayMethod] = useState<PayMethod>('alipay');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [orderId, setOrderId] = useState<string>('');
  const [payUrl, setPayUrl] = useState<string>('');
  const [qrCode, setQrCode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [pollingCount, setPollingCount] = useState(0);

  // 重置状态
  useEffect(() => {
    if (open) {
      setPaymentStatus('idle');
      setOrderId('');
      setPayUrl('');
      setQrCode('');
      setErrorMsg('');
      setPollingCount(0);
    }
  }, [open, planId, interval]);

  // 轮询支付状态
  useEffect(() => {
    if (paymentStatus !== 'pending' || !orderId) {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status/${orderId}`);
        const data = await res.json();

        if (data.success) {
          if (data.data.status === 'paid') {
            setPaymentStatus('success');
            clearInterval(timer);
            onSuccess?.();
          } else if (data.data.status === 'failed') {
            setPaymentStatus('failed');
            setErrorMsg('支付失败');
            clearInterval(timer);
          }
        }

        setPollingCount((c) => c + 1);

        // 最多轮询30次（约5分钟）
        if (pollingCount >= 30) {
          clearInterval(timer);
        }
      } catch (error) {
        console.error('查询支付状态失败:', error);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [paymentStatus, orderId, pollingCount, onSuccess]);

  // 创建支付订单
  const handleCreatePayment = async () => {
    setPaymentStatus('creating');
    setErrorMsg('');

    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          interval,
          payMethod,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setOrderId(data.data.orderId);
        setPayUrl(data.data.payUrl || '');
        setQrCode(data.data.qrCode || '');
        setPaymentStatus('pending');

        // 如果有支付URL，打开新窗口
        if (data.data.payUrl && payMethod === 'alipay') {
          window.open(data.data.payUrl, '_blank', 'width=600,height=700');
        }
      } else {
        setPaymentStatus('failed');
        setErrorMsg(data.error || '创建支付订单失败');
      }
    } catch (error: any) {
      setPaymentStatus('failed');
      setErrorMsg(error.message || '创建支付订单失败');
    }
  };

  // 重新支付
  const handleRetry = () => {
    setPaymentStatus('idle');
    setErrorMsg('');
  };

  // 关闭对话框
  const handleClose = () => {
    if (paymentStatus === 'pending') {
      if (!confirm('支付正在进行中，确定要关闭吗？')) {
        return;
      }
    }
    onOpenChange(false);
  };

  const formatCurrency = (cents: number) => {
    return `¥${(cents / 100).toFixed(2)}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>升级套餐</DialogTitle>
          <DialogDescription>
            选择支付方式完成支付，解锁更多功能
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 订单信息 */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium">{planName}</p>
              <p className="text-sm text-muted-foreground">
                {interval === 'month' ? '按月付费' : '按年付费'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(amount)}
              </p>
            </div>
          </div>

          {/* 支付方式选择 */}
          {paymentStatus === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm font-medium">选择支付方式</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`flex items-center justify-center gap-2 p-4 border rounded-lg transition-all ${
                    payMethod === 'alipay'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setPayMethod('alipay')}
                >
                  <CreditCard className="h-5 w-5 text-blue-500" />
                  <span className="font-medium">支付宝</span>
                </button>
                <button
                  className={`flex items-center justify-center gap-2 p-4 border rounded-lg transition-all ${
                    payMethod === 'wechat'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setPayMethod('wechat')}
                >
                  <Smartphone className="h-5 w-5 text-green-500" />
                  <span className="font-medium">微信支付</span>
                </button>
              </div>
            </div>
          )}

          {/* 支付中 */}
          {paymentStatus === 'creating' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">正在创建支付订单...</p>
            </div>
          )}

          {/* 等待支付 */}
          {paymentStatus === 'pending' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              {qrCode ? (
                <div className="p-4 border rounded-lg">
                  <img src={qrCode} alt="支付二维码" className="w-48 h-48" />
                </div>
              ) : (
                <div className="w-48 h-48 border rounded-lg flex items-center justify-center bg-muted">
                  <p className="text-sm text-muted-foreground text-center px-4">
                    请在新打开的窗口中完成支付
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  等待支付中...（{pollingCount}/30）
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                支付成功后将自动跳转
              </p>
            </div>
          )}

          {/* 支付成功 */}
          {paymentStatus === 'success' && (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <p className="text-xl font-semibold mb-2">支付成功</p>
              <p className="text-sm text-muted-foreground">
                您的套餐已升级，感谢您的支持！
              </p>
            </div>
          )}

          {/* 支付失败 */}
          {paymentStatus === 'failed' && (
            <div className="flex flex-col items-center justify-center py-8">
              <XCircle className="h-16 w-16 text-red-500 mb-4" />
              <p className="text-xl font-semibold mb-2">支付失败</p>
              <p className="text-sm text-muted-foreground mb-4">
                {errorMsg || '支付过程中出现错误'}
              </p>
              <Button variant="outline" onClick={handleRetry}>
                重新支付
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          {paymentStatus === 'idle' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button onClick={handleCreatePayment}>
                立即支付 {formatCurrency(amount)}
              </Button>
            </>
          )}
          {(paymentStatus === 'pending' || paymentStatus === 'creating') && (
            <Button variant="outline" onClick={handleClose}>
              关闭
            </Button>
          )}
          {paymentStatus === 'success' && (
            <Button onClick={() => onOpenChange(false)}>
              完成
            </Button>
          )}
          {paymentStatus === 'failed' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
