ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET role = 'admin' WHERE id = '312e77b3-26e8-47a5-9622-c8b43b618dc7';
ALTER TABLE public.profiles ENABLE TRIGGER USER;