import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../services/supabaseClient';
import { useAlert } from '../context/AlertContext';

const TARGET_GROUPS = [
  { id: 'customer', label: 'Customer', icon: 'person-outline' },
  { id: 'business', label: 'Business', icon: 'business-outline' },
  { id: 'rider', label: 'Rider', icon: 'bicycle-outline' },
];

const NotificationsScreen = () => {
  const { showAlert, showToast } = useAlert();
  const [selectedGroup, setSelectedGroup] = useState('customer');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [selectedGroup]);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('target_group', selectedGroup)
      .is('order_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
    } else {
      setNotifications(data || []);
    }
    setLoading(false);
  };

  const handleSendBroadcast = async () => {
    if (!title.trim() || !description.trim()) {
      showAlert({title: 'Error', message: 'Please fill in both title and description', type: 'error'});
      return;
    }

    setSending(true);
    const { error } = await supabase.from('notifications').insert([
      {
        title,
        description,
        target_group: selectedGroup,
      },
    ]);

    if (error) {
      showAlert({title: 'Error', message: 'Failed to send notification: ' + error.message, type: 'error'});
    } else {
      showToast('Broadcast sent successfully!', 'success');
      setTitle('');
      setDescription('');
      setModalVisible(false);
      fetchNotifications();
    }
    setSending(false);
  };

  const renderNotification = ({ item }: { item: any }) => (
    <View style={styles.notificationCard}>
      <View style={styles.notificationHeader}>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationTime}>
          {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Text style={styles.notificationDescription}>{item.description}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>

      <View style={styles.groupTabs}>
        {TARGET_GROUPS.map(group => (
          <TouchableOpacity
            key={group.id}
            style={[
              styles.groupTab,
              selectedGroup === group.id && styles.activeGroupTab,
            ]}
            onPress={() => setSelectedGroup(group.id)}
          >
            <Icon
              name={group.icon}
              size={20}
              color={selectedGroup === group.id ? '#007AFF' : '#666'}
            />
            <Text
              style={[
                styles.groupTabText,
                selectedGroup === group.id && styles.activeGroupTabText,
              ]}
            >
              {group.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="mail-unread-outline" size={80} color="#ccc" />
              <Text style={styles.emptyText}>No notifications sent to {selectedGroup}s yet.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setModalVisible(true)}
      >
        <Icon name="add" size={30} color="#fff" />
        <Text style={styles.createButtonText}>Create Message</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New {selectedGroup} Broadcast</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Message Title"
              placeholderTextColor="#999"
              value={title}
              onChangeText={setTitle}
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Message Description"
              placeholderTextColor="#999"
              value={description}
              onChangeText={setDescription}
              multiline={true}
              numberOfLines={4}
            />

            <TouchableOpacity
              style={[styles.sendButton, sending && styles.disabledButton]}
              onPress={handleSendBroadcast}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="send" size={20} color="#fff" />
                  <Text style={styles.sendButtonText}>Send Broadcast</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  groupTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  groupTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeGroupTab: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  groupTabText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  activeGroupTabText: {
    color: '#007AFF',
  },
  listContainer: {
    padding: 15,
    paddingBottom: 100,
  },
  notificationCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notificationTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
    marginLeft: 10,
  },
  notificationDescription: {
    fontSize: 15,
    color: '#666',
    lineHeight: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: 20,
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  createButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 25,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
    color: '#333',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 15,
    marginTop: 10,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default NotificationsScreen;
