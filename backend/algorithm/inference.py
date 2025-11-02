import os, glob, sys
import numpy as np
import librosa
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from sklearn.preprocessing import LabelEncoder
import torch.optim as optim
from tqdm import tqdm
from scipy.signal import find_peaks

SR = 22050*2
FIXED_LEN = 0.30
N_MELS = 80
N_FFT = 1024
HOP = 256
MAX_T = 31

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {DEVICE}", file=sys.stderr)

def segment_fixed(y, sr, fixed_len=FIXED_LEN):
    fixed_samples = int(fixed_len * sr)
    energy = np.square(y)
    mean_energy = np.mean(energy)
    std_energy = np.std(energy)
    threshold = mean_energy + 0.5 * std_energy
    
    print(f"Segmentation: {fixed_len}s, {fixed_samples} samples", file=sys.stderr)
    print(f"Energy threshold: {threshold:.6f}", file=sys.stderr)
    
    peaks, _ = find_peaks(energy, height=threshold, distance=int(0.8*fixed_samples))
    print(f"Found {len(peaks)} peaks", file=sys.stderr)
    
    segments = []
    for idx, start in enumerate(peaks[:-1]):
        end = start + fixed_samples
        if end > len(y):
            segment = np.zeros(fixed_samples)
            segment[:len(y)-start] = y[start:]
        else:
            segment = y[start:end]
        segments.append(segment)
        print(f"Segment {idx+1}: {start/sr:.3f}s - {end/sr:.3f}s", file=sys.stderr)
    
    return segments

def preprocess_single_segment(segment, sr=SR, max_T=MAX_T):
    mel = librosa.feature.melspectrogram(
        y=segment, sr=sr, n_mels=N_MELS, n_fft=N_FFT, hop_length=HOP
    )
    logmel = librosa.power_to_db(mel, ref=np.max)

    if logmel.shape[1] < max_T:
        logmel = np.pad(logmel, ((0,0), (0, max_T - logmel.shape[1])))
    elif logmel.shape[1] > max_T:
        logmel = logmel[:, :max_T]

    X = torch.tensor(logmel, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    return X

class KeyDataset(Dataset):
    def __init__(self, npz_file, mean=None, std=None):
        data = np.load(npz_file, allow_pickle=True)
        X, y = data["X"], data["y"]
        self.X = torch.tensor(X, dtype=torch.float32).unsqueeze(1)
        self.le = LabelEncoder()
        self.y = torch.tensor(self.le.fit_transform(y), dtype=torch.long)
        self.mean = mean
        self.std = std
        self.num_classes = len(self.le.classes_)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, i):
        X = self.X[i]
        if self.mean is not None and self.std is not None:
            mean_t = torch.tensor(self.mean, dtype=torch.float32).unsqueeze(0).unsqueeze(-1)
            std_t = torch.tensor(self.std, dtype=torch.float32).unsqueeze(0).unsqueeze(-1)
            X = (X - mean_t) / std_t
        y = self.y[i]
        return X, y

class KeyCNN(nn.Module):
    def __init__(self, num_classes, n_mels, max_T, dropout=0.3):
        super().__init__()

        self.features = nn.Sequential(
            nn.Conv2d(1, 16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2)
        )

        with torch.no_grad():
            dummy = torch.zeros(1, 1, n_mels, max_T)
            feat_dim = self.features(dummy).numel()

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(feat_dim, 256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, num_classes)
        )

    def forward(self, x):
        x = self.features(x)
        x = self.classifier(x)
        return x


def run_model(segment, model=None, norm=True, mean=None, std=None, label_encoder=None, device=None):
    if device is None:
        device = DEVICE
    
    print(f"run_model: device={device}, shape={segment.shape}", file=sys.stderr)

    if model is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(script_dir, 'CamHack25Model.pth')
        print(f"Loading model from {model_path}", file=sys.stderr)
        model = KeyCNN(num_classes=30, n_mels=N_MELS, max_T=MAX_T, dropout=0)
        checkpoint = torch.load(model_path, map_location=torch.device(device), weights_only=False)
        model.load_state_dict(checkpoint["model_state"])
        print("Model loaded", file=sys.stderr)
        
    if label_encoder is None:
        label_encoder = np.array([
            'a', 'b', 'back', 'c', 'caps', 'd', 'e', 'enter', 'f', 'g', 'h',
            'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 'space',
            't', 'u', 'v', 'w', 'x', 'y', 'z'
        ])

    if mean is None:
        mean = np.array([
            -18.690125, -17.937227, -20.178814, -21.39577,  -22.90489,  -25.344667,
            -25.200706, -25.870438, -27.667503, -28.248032, -28.61455,  -30.366795,
            -31.553476, -31.471077, -32.494427, -32.407806, -32.144608, -31.928093,
            -31.255938, -30.092798, -29.93129,  -30.652029, -30.987606, -30.183636,
            -30.418541, -30.479534, -31.047739, -30.846657, -31.056345, -31.67745,
            -32.05866,  -31.589922, -31.438263, -31.73294,  -31.044409, -29.947796,
            -29.480114, -28.986467, -30.146425, -31.518671, -32.131927, -32.377476,
            -33.22641,  -33.784355, -34.610077, -35.391735, -35.672245, -36.18823,
            -36.758812, -37.637493, -38.119488, -38.915016, -39.976055, -40.84624,
            -40.925423, -40.965954, -40.944855, -41.161293, -41.926453, -42.55703,
            -44.026775, -46.215824, -48.264957, -49.8878,   -52.491528, -55.351982,
            -55.84319,  -54.535446, -53.178654, -54.9578,   -57.909946, -57.405613,
            -55.86575,  -57.71442,  -65.29873,  -76.92206,  -77.136894, -77.17928,
            -77.197235, -77.20928
        ])

    if std is None:
        std = np.array([
             8.576318,   8.854839,   9.39697,    9.527076,   9.6370125, 10.0065975,
            10.705423,  11.350877,  11.297618,  11.208822,  11.187727,  10.835598,
            10.80825,   11.088621,  11.144277,  11.315839,  11.448063,  11.587413,
            11.595148,  11.569159,  11.566742,  11.504058,  11.419408,  11.599466,
            11.915029,  11.717062,  11.623136,  11.726322,  11.675442,  11.525686,
            11.5016,    11.787873,  11.7547865, 11.569471,  11.843251,  12.251474,
            12.446213,  12.53736,   12.386773,  12.181224,  12.060491,  12.234913,
            12.169081,  11.926555,  11.784956,  11.570252,  11.6612015, 11.683452,
            11.707088,  11.828493,  11.858997,  11.687013,  11.532765,  11.553801,
            11.899452,  11.845104,  11.779862,  11.907657,  11.796166,  12.009947,
            12.4514675, 12.708061,  12.993721,  13.408402,  13.652015,  13.597028,
            13.0132675, 12.87739,   13.1525755, 13.158555,  13.388524,  13.573122,
            13.909223,  14.273433,  13.754259,  10.92386,   10.819994,  10.760114,
            10.717187,  10.690204
        ])

    model.eval()
    model.to(device)

    print("Preprocessing segment", file=sys.stderr)
    X = preprocess_single_segment(segment)
    print(f"Preprocessed shape: {X.shape}", file=sys.stderr)
    X = X.to(device)

    if norm:
        mean_t = torch.tensor(mean, dtype=torch.float32, device=device).unsqueeze(0).unsqueeze(-1)
        std_t = torch.tensor(std, dtype=torch.float32, device=device).unsqueeze(0).unsqueeze(-1)
        X = (X - mean_t) / std_t
        print("Applied normalization", file=sys.stderr)

    with torch.no_grad():
        pred = model(X)
        pred_idx = pred.argmax(1).item()
        confidence = torch.softmax(pred, dim=1)[0, pred_idx].item()
        print(f"Prediction: idx={pred_idx}, confidence={confidence:.4f}", file=sys.stderr)

    if isinstance(label_encoder, np.ndarray):
        label = label_encoder[pred_idx]
    else:
        label = label_encoder.inverse_transform([pred_idx])[0]

    print(f"Predicted: {label}", file=sys.stderr)
    return label